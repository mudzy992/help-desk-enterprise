import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketMutationContext } from '../tickets.types';
import { loadTicketAttachmentRecord } from './load-ticket-attachment-record';
import type {
  TicketAttachmentResponse,
  TicketAttachmentStorage,
} from './attachments.types';
import { toTicketAttachmentResponse } from './to-attachment-response';

export async function downloadTicketAttachment(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  storage: TicketAttachmentStorage,
  ticketId: string,
  attachmentId: string,
  context: TicketMutationContext,
): Promise<{ metadata: TicketAttachmentResponse; contents: Buffer }> {
  const { ticket, record } = await loadTicketAttachmentRecord(
    prisma,
    authorizationContextLoader,
    ticketId,
    attachmentId,
    context,
    permissionKeys.ticketAttachmentsDownload,
  );
  return {
    metadata: toTicketAttachmentResponse(record, ticket),
    contents: await storage.read(record.storagePath),
  };
}
