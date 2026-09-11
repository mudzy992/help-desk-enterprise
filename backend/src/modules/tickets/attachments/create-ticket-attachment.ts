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
import { toTicketAttachmentResponse } from './to-attachment-response';
import { validateTicketAttachment } from './validate-ticket-attachment';

export async function createTicketAttachment(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  storage: TicketAttachmentStorage,
  configuration: TicketAttachmentConfiguration,
  ticketId: string,
  file: TicketAttachmentUploadInput | undefined,
  context: TicketMutationContext,
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
  const existingCount = await prisma.ticketAttachment.count({
    where: { ticketId },
  });
  const validated = validateTicketAttachment({
    file,
    configuration,
    ticketClassification: ticket.classification,
    existingCount,
  });
  const contents = file?.buffer;
  if (contents === undefined) {
    throw new TicketsError('ATTACHMENT_REQUIRED');
  }
  const storagePath = await storage.write({
    ticketId: ticket.id,
    extension: validated.extension,
    contents,
  });
  try {
    const messages: TicketMessageRecord[] = [];
    const created = await prisma.$transaction(async (transaction) => {
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
    });
    return {
      attachment: toTicketAttachmentResponse(created, ticket),
      messages,
    };
  } catch (error) {
    await storage.remove(storagePath);
    throw error;
  }
}
