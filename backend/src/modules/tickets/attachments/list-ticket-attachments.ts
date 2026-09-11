import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketMutationContext } from '../tickets.types';
import { assertTicketAttachmentPermission } from './assert-ticket-attachment-permission';
import type {
  TicketAttachmentRecord,
  TicketAttachmentResponse,
} from './attachments.types';
import { raiseStoredAttachmentClassification } from './raise-stored-attachment-classification';
import { toTicketAttachmentResponse } from './to-attachment-response';

export async function listTicketAttachments(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<readonly TicketAttachmentResponse[]> {
  const ticket = await assertTicketAttachmentPermission(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
    permissionKeys.ticketAttachmentsDownload,
  );
  const records = (await prisma.ticketAttachment.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'asc' },
  })) as TicketAttachmentRecord[];
  const reconciled: TicketAttachmentResponse[] = [];
  for (const record of records) {
    const current = await raiseStoredAttachmentClassification(
      prisma,
      ticket,
      record,
    );
    reconciled.push(toTicketAttachmentResponse(current, ticket));
  }
  return reconciled;
}
