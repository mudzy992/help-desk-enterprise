import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketMessageRecord, TicketPersistedMessageSink } from '../collaboration.types';
import { registerMessageTicket } from '../publish-persisted-ticket-messages';
import type { TicketRecord } from '../tickets.types';
import { ticketMergeTexts } from './merge.constants';

/**
 * Package 1.2, M4: a public agent reply on a parent is copied, marked
 * "Poruka s HD-…", to every merged child, so each child's requester gets it
 * through the normal in-app and e-mail notifications. Internal notes are never
 * copied. Attachments stay on the parent (the child's requester reads them
 * there through MERGED_REQUESTER access).
 */
export async function copyMessageToMergedTickets(input: {
  readonly prisma: PrismaService;
  readonly parent: TicketRecord;
  readonly message: TicketMessageRecord;
  readonly messages: TicketPersistedMessageSink;
}): Promise<number> {
  if (input.message.type !== 'AGENT_REPLY') {
    return 0;
  }
  const children = (await input.prisma.ticket.findMany({
    where: { mergedIntoTicketId: input.parent.id },
  })) as TicketRecord[];
  for (const child of children) {
    registerMessageTicket(input.messages, child);
    input.messages.push(
      (await input.prisma.ticketMessage.create({
        data: {
          ticketId: child.id,
          type: 'AGENT_REPLY',
          body: ticketMergeTexts.copiedFromParent(input.parent.ticketNumber, input.message.body),
          authorUserId: input.message.authorUserId,
        },
      })) as TicketMessageRecord,
    );
  }
  return children.length;
}
