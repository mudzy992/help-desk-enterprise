import { PrismaService } from '../../../common/prisma/prisma.service';
import { changeLogActions } from '../../change-log/change-log.constants';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadTicketRecord } from '../load-ticket-record';
import { recordTicketChange } from '../record-ticket-change';
import { syncAssigneeParticipant } from '../sync-assignee-participant';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import { ticketAssignmentChangeLogReasons } from './assignment.constants';

/** Statuses the problem group resolution takes over before resolving. */
export const problemTakeoverStatuses = ['PENDING', 'UNROUTED', 'ASSIGNED'] as const;

/**
 * Paket 3.3 (decision 2026-10-01): a linked ticket nobody started is taken
 * over by whoever resolves the problem: the resolver becomes the assignee
 * (an existing assignee is kept) and the ticket moves to IN_PROGRESS, so the
 * normal IN_PROGRESS -> RESOLVED path follows. Called only by the problem
 * resolution after `problem.close` was verified. A single conditional write
 * keeps it safe against a concurrent claim: if the ticket changed, nothing is
 * written and the caller resolves it as it is now (or skips it).
 */
export async function takeOverTicketForProblem(
  prisma: PrismaService,
  input: {
    readonly ticketId: string;
    readonly actorUserId: string;
    readonly problemDetail: string;
  },
  messages: TicketPersistedMessageSink = [],
): Promise<TicketRecord> {
  const current = await loadTicketRecord(prisma, input.ticketId);
  if (!(problemTakeoverStatuses as readonly string[]).includes(current.status)) return current;
  if (current.status === 'ARCHIVED' || current.mergedIntoTicketId !== null) throw new TicketsError('INVALID_STATUS_TRANSITION');
  const assignedUserId = current.assignedUserId ?? input.actorUserId;
  return prisma.$transaction(async (transaction) => {
    const won = await transaction.ticket.updateMany({
      where: { id: current.id, status: current.status, assignedUserId: current.assignedUserId },
      data: { assignedUserId, status: 'IN_PROGRESS' },
    });
    const updated = (await transaction.ticket.findUnique({ where: { id: current.id } })) as TicketRecord | null;
    if (updated === null) throw new TicketsError('NOT_FOUND');
    if (won.count === 0) return updated;
    await recordTicketChange(transaction as PrismaService, {
      action: changeLogActions.update,
      reason: ticketAssignmentChangeLogReasons.problemTakeover,
      before: current,
      after: updated,
      actorUserId: input.actorUserId,
    });
    await syncAssigneeParticipant(transaction as PrismaService, updated);
    messages.push(
      await insertSystemTicketEvent(transaction as PrismaService, {
        ticketId: updated.id,
        action: ticketSystemEventActions.problemTakeover,
        actorUserId: input.actorUserId,
        detail: input.problemDetail,
      }),
    );
    return updated;
  });
}
