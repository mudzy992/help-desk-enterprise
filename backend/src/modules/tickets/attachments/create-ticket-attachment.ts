import { createHash } from 'node:crypto';
import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../../change-log/change-log.constants';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketMessageRecord } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { recordCollaborationChange } from '../record-collaboration-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import { assertTicketAttachmentPermission } from './assert-ticket-attachment-permission';
import type {
  TicketAttachmentRecord,
  TicketAttachmentResponse,
  TicketAttachmentStorage,
  TicketAttachmentUploadInput,
  TicketAttachmentConfiguration,
} from './attachments.types';
import { scanAttachmentWithClamav } from './scan-attachment-with-clamav';
import { toTicketAttachmentResponse } from './to-attachment-response';
import { validateTicketAttachment } from './validate-ticket-attachment';
import { runAttachmentQuotaTransaction } from './run-attachment-quota-transaction';
import { scanAttachmentPathWithClamav } from './scan-attachment-path-with-clamav';
import { withAttachmentIoLimit } from './attachment-io-limiter';

export async function createTicketAttachment(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  storage: TicketAttachmentStorage,
  configuration: TicketAttachmentConfiguration,
  ticketId: string,
  file: TicketAttachmentUploadInput | undefined,
  context: TicketMutationContext,
  idempotencyKey?: string,
): Promise<{
  attachment: TicketAttachmentResponse;
  messages: readonly TicketMessageRecord[];
}> {
  const ticket = await assertTicketAttachmentPermission(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    permissionKeys.ticketAttachmentsUpload,
  );
  const contents = file?.buffer;
  if (contents === undefined || file === undefined) throw new TicketsError('ATTACHMENT_REQUIRED');
  const payloadHash = idempotencyKey === undefined ? null : createHash('sha256').update(contents).digest('hex');
  if (idempotencyKey !== undefined) {
    const existing = await prisma.ticketAttachment.findUnique({
      where: { ticketId_idempotencyKey: { ticketId, idempotencyKey } },
    });
    if (existing !== null) {
      if (existing.payloadHash !== payloadHash) throw new Error('Inbound attachment idempotency payload mismatch');
      return { attachment: toTicketAttachmentResponse(existing as TicketAttachmentRecord, ticket), messages: [] };
    }
  }
  const existingCount = await prisma.ticketAttachment.count({ where: { ticketId } });
  const validated = validateTicketAttachment({
    file,
    configuration,
    ticketClassification: ticket.classification,
    existingCount,
  });
  const idempotencyFields = idempotencyKey === undefined ? {} : { idempotencyKey, payloadHash: payloadHash! };
  const storagePath = await withAttachmentIoLimit(async () => {
    if (file.temporaryPath !== undefined && storage.writeFromPath !== undefined) {
      await scanAttachmentPathWithClamav(file.temporaryPath);
      return storage.writeFromPath({
        ticketId: ticket.id,
        extension: validated.extension,
        sourcePath: file.temporaryPath,
        ...idempotencyFields,
      });
    }
    await scanAttachmentWithClamav(contents);
    return storage.write({ ticketId: ticket.id, extension: validated.extension, contents, ...idempotencyFields });
  });
  const messages: TicketMessageRecord[] = [];
  let created: TicketAttachmentRecord;
  try {
    created = await runAttachmentQuotaTransaction({
      prisma,
      ticketId: ticket.id,
      maxFiles: configuration.maxFilesPerTicket,
      operation: async (transaction) => {
        const record = (await transaction.ticketAttachment.create({
          data: {
            ticketId: ticket.id,
            storagePath,
            originalName: validated.originalName,
            mimeType: validated.mimeType,
            extension: validated.extension,
            sizeBytes: validated.sizeBytes,
            classification: validated.classification,
            uploadedByUserId: context.actorUserId,
            ...(idempotencyKey === undefined ? {} : { idempotencyKey, payloadHash }),
          },
        })) as TicketAttachmentRecord;
        await recordCollaborationChange(transaction as PrismaService, {
          entityType: changeLogEntityTypes.ticketAttachment,
          entityId: record.id,
          action: changeLogActions.create,
          reason: ticketChangeLogReasons.attachmentUpload,
          before: {},
          after: toTicketAttachmentResponse(record, ticket),
          actorUserId: context.actorUserId,
        });
        messages.push(
          await insertSystemTicketEvent(transaction as PrismaService, {
            ticketId: ticket.id,
            action: ticketSystemEventActions.attachmentUploaded,
            actorUserId: context.actorUserId,
          }),
        );
        return record;
      },
    });
  } catch (error) {
    if (idempotencyKey !== undefined) {
      if (isUniqueConstraintError(error)) {
        let existing: TicketAttachmentRecord | null;
        try {
          existing = await prisma.ticketAttachment.findUnique({
            where: { ticketId_idempotencyKey: { ticketId, idempotencyKey } },
          });
        } catch {
          // The transaction outcome is uncertain; keep the deterministic blob for replay.
          throw error;
        }
        if (existing !== null) {
          if (existing.payloadHash !== payloadHash) {
            if (existing.storagePath !== storagePath) await storage.remove(storagePath);
            throw new Error('Inbound attachment idempotency payload mismatch');
          }
          if (existing.storagePath !== storagePath) await storage.remove(storagePath);
          return { attachment: toTicketAttachmentResponse(existing as TicketAttachmentRecord, ticket), messages: [] };
        }
        await storage.remove(storagePath);
      }
      // For non-unique DB errors, a commit may have succeeded despite a lost
      // acknowledgement. Preserve the stable blob so the next replay can bind it.
      throw error;
    }
    await storage.remove(storagePath);
    throw error;
  }
  return { attachment: toTicketAttachmentResponse(created, ticket), messages };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002';
}
