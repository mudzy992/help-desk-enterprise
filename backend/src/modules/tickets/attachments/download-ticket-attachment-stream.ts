import type { Readable } from 'node:stream';
import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketMutationContext } from '../tickets.types';
import { loadTicketAttachmentRecord } from './load-ticket-attachment-record';
import type { TicketAttachmentResponse, TicketAttachmentStorage } from './attachments.types';
import { toTicketAttachmentResponse } from './to-attachment-response';
import { TicketsError } from '../tickets.error';
import { acquireAttachmentIoLease } from './attachment-io-limiter';

export async function downloadTicketAttachmentStream(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  storage: TicketAttachmentStorage,
  ticketId: string,
  attachmentId: string,
  context: TicketMutationContext,
): Promise<{ metadata: TicketAttachmentResponse; stream: Readable }> {
  const { ticket, record } = await loadTicketAttachmentRecord(prisma, authorizationContextLoader, ticketId, attachmentId, context, permissionKeys.ticketAttachmentsDownload);
  if (storage.openReadStream === undefined) throw new TicketsError('ATTACHMENTS_STORAGE_UNAVAILABLE');
  const release = await acquireAttachmentIoLease();
  try {
    const stream = await storage.openReadStream(record.storagePath);
    stream.once('end', release);
    stream.once('close', release);
    stream.once('error', release);
    return { metadata: toTicketAttachmentResponse(record, ticket), stream };
  } catch (error) {
    release();
    throw error;
  }
}
