import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { applyTicketMerge } from '../merge/apply-ticket-merge';
import { assertMergeAllowed } from '../merge/assert-merge-allowed';
import { normalizeRequiredReason } from '../merge/normalize-merge-reason';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import type { ExecuteTicketBulkInput } from './bulk.types';

/**
 * Package 1.2: bulk "merge into parent" uses the same rules (M1) and writes
 * (M2) as the single merge from the ticket detail; the reason is required.
 */
export async function applyBulkMerge(input: {
  readonly prisma: PrismaService;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
}): Promise<readonly TicketRecord[]> {
  const parentId = input.body.parentTicketId?.trim() ?? '';
  const parent =
    input.tickets.find((ticket) => ticket.id === parentId) ?? null;
  if (parent === null) {
    throw new TicketsError('NOT_FOUND');
  }
  const children = input.tickets.filter((ticket) => ticket.id !== parent.id);
  if (children.length === 0) {
    throw new TicketsError('BULK_ACTION_NOT_ALLOWED');
  }
  if ((input.body.reason?.trim() ?? '').length === 0) {
    throw new TicketsError('BULK_REASON_REQUIRED');
  }
  const reason = normalizeRequiredReason(input.body.reason, 'MERGE_REASON_REQUIRED');
  await assertMergeAllowed(input.prisma, parent, children);
  const merged = await applyTicketMerge({
    prisma: input.prisma,
    parent,
    children,
    reason,
    context: input.actor,
    messages: input.messages,
    batchId: input.batchId,
  });
  return [parent, ...merged];
}
