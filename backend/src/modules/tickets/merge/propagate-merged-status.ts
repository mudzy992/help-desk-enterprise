import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketStatus } from '../../../generated/prisma/enums';
import { changeLogActions } from '../../change-log/change-log.constants';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { applyTicketSlaTimers } from '../apply-ticket-sla-timers';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { registerMessageTicket } from '../publish-persisted-ticket-messages';
import { recordTicketChange } from '../record-ticket-change';
import { ticketStatusChangeSystemEvent } from '../ticket-status-change-system-event';
import { ticketChangeLogReasons } from '../tickets.constants';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { propagatedParentStatuses } from './merge.constants';

export type PropagatedChildChange = {
  readonly before: TicketRecord;
  readonly after: TicketRecord;
};

/**
 * Package 1.2, M3 — merged children follow the parent when it is resolved,
 * closed or reopened (out of RESOLVED/CLOSED). Other steps of the parent
 * (in progress, waiting for the user…) are its internal work and are not
 * copied. Close code and resolution note travel with a resolve/close.
 *
 * Runs inside the caller's transaction; the resolved/closed system event on
 * each child is what sends the child's requester the usual notification.
 * Call `syncPropagatedChildrenSla` after the transaction.
 */
export async function propagateMergedStatus(input: {
  readonly tx: PrismaService;
  readonly parent: TicketRecord;
  readonly previousStatus: TicketStatus;
  readonly actorUserId: string;
  readonly messages: TicketPersistedMessageSink;
  readonly now?: Date;
}): Promise<readonly PropagatedChildChange[]> {
  const { parent, previousStatus } = input;
  if (!shouldPropagate(previousStatus, parent.status)) {
    return [];
  }
  const children = (await input.tx.ticket.findMany({
    where: { mergedIntoTicketId: parent.id, status: { not: parent.status } },
  })) as TicketRecord[];
  const now = input.now ?? new Date();
  const changes: PropagatedChildChange[] = [];
  for (const child of children) {
    const resolving = propagatedParentStatuses.includes(parent.status);
    const after = (await input.tx.ticket.update({
      where: { id: child.id },
      data: {
        status: parent.status,
        ...applyTicketLifecycleTimestamps({ current: child, nextStatus: parent.status, now }),
        ...(resolving
          ? { closeCodeId: parent.closeCodeId, resolutionNote: parent.resolutionNote }
          : {}),
      },
    })) as TicketRecord;
    registerMessageTicket(input.messages, after);
    await recordTicketChange(input.tx, {
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.mergedStatusPropagation,
      before: child,
      after,
      actorUserId: input.actorUserId,
    });
    input.messages.push(
      await insertSystemTicketEvent(input.tx, {
        ticketId: child.id,
        action: ticketSystemEventActions.ticketMergedStatusPropagated,
        actorUserId: input.actorUserId,
        detail: `${parent.ticketNumber}:${parent.status}`,
      }),
    );
    const statusEvent = ticketStatusChangeSystemEvent(child.status, after.status);
    if (statusEvent !== null) {
      input.messages.push(
        await insertSystemTicketEvent(input.tx, {
          ticketId: child.id,
          action: statusEvent,
          actorUserId: input.actorUserId,
        }),
      );
    }
    changes.push({ before: child, after });
  }
  return changes;
}

export function shouldPropagate(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) {
    return false;
  }
  if (propagatedParentStatuses.includes(to)) {
    return true;
  }
  // Reopen: out of RESOLVED/CLOSED into active work.
  return propagatedParentStatuses.includes(from) && to !== 'ARCHIVED';
}

/**
 * Resolve/close completes the child's SLA like a manual change; a reopen keeps
 * the clock stopped (the child is still merged, the work runs on the parent).
 */
export async function syncPropagatedChildrenSla(
  context: TicketMutationContext,
  changes: readonly PropagatedChildChange[],
  now?: Date,
): Promise<void> {
  for (const change of changes) {
    await applyTicketSlaTimers(context, {
      ticket: change.after,
      previousStatus: change.before.status,
      now,
      event: propagatedParentStatuses.includes(change.after.status)
        ? 'status_changed'
        : 'merged',
    });
  }
}
