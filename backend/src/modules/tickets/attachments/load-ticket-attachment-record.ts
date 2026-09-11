import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { assertTicketAttachmentPermission } from './assert-ticket-attachment-permission';
import type { TicketAttachmentRecord } from './attachments.types';
import { raiseStoredAttachmentClassification } from './raise-stored-attachment-classification';

export async function loadTicketAttachmentRecord(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  attachmentId: string,
  context: TicketMutationContext,
  permissionKey:
    | typeof permissionKeys.ticketAttachmentsUpload
    | typeof permissionKeys.ticketAttachmentsDownload,
): Promise<{ ticket: TicketRecord; record: TicketAttachmentRecord }> {
  const ticket = await assertTicketAttachmentPermission(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    permissionKey,
  );
  const record = (await prisma.ticketAttachment.findFirst({
    where: { id: attachmentId, ticketId: ticket.id },
  })) as TicketAttachmentRecord | null;
  if (record === null) {
    throw new TicketsError('ATTACHMENT_NOT_FOUND');
  }
  return {
    ticket,
    record: await raiseStoredAttachmentClassification(prisma, ticket, record),
  };
}
