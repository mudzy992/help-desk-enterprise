import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import {
  nonMergeableTicketStatuses,
  ticketMergeConstants,
} from './merge.constants';

type MergeTicket = Pick<
  TicketRecord,
  'id' | 'status' | 'mergedIntoTicketId' | 'isConfidential'
>;

/**
 * Package 1.2, rule set M1, shared by the single merge and the bulk action:
 *  - no chains: the parent is not merged and a child is not itself a parent;
 *  - neither side is closed or archived;
 *  - confidential and non-confidential tickets never mix (the child's
 *    requester gets read access to the parent);
 *  - at most 50 children per merge.
 * One query (children that are parents of merged tickets).
 */
export async function assertMergeAllowed(
  prisma: PrismaService,
  parent: MergeTicket,
  children: readonly MergeTicket[],
): Promise<void> {
  if (children.length === 0) {
    throw new TicketsError('MERGE_CHILD_INVALID');
  }
  if (children.length > ticketMergeConstants.maximumChildren) {
    throw new TicketsError('MERGE_LIMIT_EXCEEDED');
  }
  if (children.some((child) => child.id === parent.id)) {
    throw new TicketsError('MERGE_SELF');
  }
  if (
    parent.mergedIntoTicketId !== null ||
    nonMergeableTicketStatuses.includes(parent.status)
  ) {
    throw new TicketsError('MERGE_PARENT_INVALID');
  }
  for (const child of children) {
    if (
      child.mergedIntoTicketId !== null ||
      nonMergeableTicketStatuses.includes(child.status)
    ) {
      throw new TicketsError('MERGE_CHILD_INVALID', undefined, { ticketId: child.id });
    }
    if (child.isConfidential !== parent.isConfidential) {
      throw new TicketsError('MERGE_CONFIDENTIAL_MISMATCH', undefined, {
        ticketId: child.id,
      });
    }
  }
  const nestedParent = await prisma.ticket.findFirst({
    where: { mergedIntoTicketId: { in: children.map((child) => child.id) } },
    select: { mergedIntoTicketId: true },
  });
  if (nestedParent !== null) {
    throw new TicketsError('MERGE_CHILD_INVALID', undefined, {
      ticketId: nestedParent.mergedIntoTicketId,
    });
  }
}
