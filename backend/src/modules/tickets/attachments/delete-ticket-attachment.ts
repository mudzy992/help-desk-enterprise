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
import type { TicketMutationContext } from '../tickets.types';
import { loadTicketAttachmentRecord } from './load-ticket-attachment-record';
import type { TicketAttachmentStorage } from './attachments.types';
import { toTicketAttachmentResponse } from './to-attachment-response';
import { createAttachmentDeletionIntent, promoteAttachmentDeletion } from './attachment-deletion-intent';

export async function deleteTicketAttachment(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  storage: TicketAttachmentStorage,
  ticketId: string,
  attachmentId: string,
  context: TicketMutationContext,
): Promise<{ messages: readonly TicketMessageRecord[] }> {
  const { ticket, record } = await loadTicketAttachmentRecord(
    prisma,
    authorizationContextLoader,
    ticketId,
    attachmentId,
    context,
    permissionKeys.ticketAttachmentsUpload,
  );
  const messages: TicketMessageRecord[] = [];
  const intentId = await prisma.$transaction(async (transaction) => {
    const deletionIntentId = transaction.storageWriteIntent
      ? await createAttachmentDeletionIntent(transaction as PrismaService, {
          attachmentId: record.id,
          storagePath: record.storagePath,
          sizeBytes: record.sizeBytes,
        })
      : undefined;
    await transaction.ticketAttachment.delete({ where: { id: record.id } });
    await recordCollaborationChange(transaction as PrismaService, {
      entityType: changeLogEntityTypes.ticketAttachment,
      entityId: record.id,
      action: changeLogActions.delete,
      reason: ticketChangeLogReasons.attachmentDelete,
      before: toTicketAttachmentResponse(record, ticket),
      after: {},
      actorUserId: context.actorUserId,
    });
    messages.push(
      await insertSystemTicketEvent(transaction as PrismaService, {
        ticketId: ticket.id,
        action: ticketSystemEventActions.attachmentDeleted,
        actorUserId: context.actorUserId,
      }),
    );
    return deletionIntentId;
  });
  if (intentId === undefined) await storage.remove(record.storagePath);
  else await promoteAttachmentDeletion({ prisma, storage, intentId });
  return { messages };
}
