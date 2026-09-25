import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { assertPatchTicketStatus } from '../assert-patch-ticket-status';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { applyTicketSlaTimers } from '../apply-ticket-sla-timers';
import { assertTicketNotMerged } from '../merge/assert-ticket-editable';
import {
  propagateMergedStatus,
  syncPropagatedChildrenSla,
} from '../merge/propagate-merged-status';
import {
  auditBulkTicketChange,
  ticketChangeLogReasons,
  ticketSystemEventActions,
} from './audit-bulk-ticket-change';
import type { ExecuteTicketBulkInput } from './bulk.types';

export async function applyBulkStatus(input: {
  readonly prisma: PrismaService;
  readonly context: AuthorizationContext;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
}): Promise<readonly TicketRecord[]> {
  const status = input.body.status;
  if (status === undefined) {
    throw new TicketsError('INVALID_STATUS_TRANSITION');
  }
  const reason = input.body.reason?.trim() ?? '';
  if (reason.length === 0) {
    throw new TicketsError('BULK_REASON_REQUIRED');
  }
  const updated: TicketRecord[] = [];
  const now = new Date();
  for (const ticket of input.tickets) {
    // Package 1.2 (M3): merged children follow their parent only.
    assertTicketNotMerged(ticket);
  }
  for (const ticket of input.tickets) {
    assertPatchTicketStatus({
      context: input.context,
      from: ticket.status,
      to: status,
    });
    const timestamps = applyTicketLifecycleTimestamps({
      current: ticket,
      nextStatus: status,
      now,
    });
    const next = (await input.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status, ...timestamps },
    })) as TicketRecord;
    await auditBulkTicketChange({
      prisma: input.prisma,
      before: ticket,
      after: next,
      context: input.actor,
      reason: ticketChangeLogReasons.bulkStatus,
      action: `${ticketSystemEventActions.ticketBulkStatus}:${reason}`,
      batchId: input.batchId,
      messages: input.messages,
    });
    updated.push(next);
    await applyTicketSlaTimers(input.actor, {
      ticket: next,
      previousStatus: ticket.status,
      now,
      event: 'status_changed',
    });
    const propagated = await propagateMergedStatus({
      tx: input.prisma,
      parent: next,
      previousStatus: ticket.status,
      actorUserId: input.actor.actorUserId,
      messages: input.messages,
      now,
    });
    await syncPropagatedChildrenSla(input.actor, propagated, now);
  }
  return updated;
}
