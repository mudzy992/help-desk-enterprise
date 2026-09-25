import { PrismaService } from '../../../common/prisma/prisma.service';
import { applyTicketSlaTimers } from '../apply-ticket-sla-timers';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { assertPriorityEditable } from '../merge/assert-ticket-editable';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import {
  auditBulkTicketChange,
  ticketChangeLogReasons,
  ticketSystemEventActions,
} from './audit-bulk-ticket-change';
import type { ExecuteTicketBulkInput } from './bulk.types';

/**
 * Package 1.2 (P4): the bulk action sets exactly the chosen priority and marks
 * it as manual, the same semantics as `POST /tickets/:id/priority`. Impact and
 * urgency are left alone (they describe the incident, not the decision), and
 * the SLA targets follow the new priority (P5).
 */
export async function applyBulkPriority(input: {
  readonly prisma: PrismaService;
  readonly actor: TicketMutationContext;
  readonly tickets: readonly TicketRecord[];
  readonly body: ExecuteTicketBulkInput;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
}): Promise<readonly TicketRecord[]> {
  const priority = input.body.priority;
  if (priority === undefined) {
    throw new TicketsError('BULK_ACTION_NOT_ALLOWED');
  }
  const reason = input.body.reason?.trim() ?? '';
  if (reason.length === 0) {
    throw new TicketsError('BULK_REASON_REQUIRED');
  }
  for (const ticket of input.tickets) {
    assertPriorityEditable(ticket);
  }
  const updated: TicketRecord[] = [];
  const now = new Date();
  for (const ticket of input.tickets) {
    const next = (await input.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        priority,
        priorityOverridden: true,
        priorityOverriddenAt: now,
        priorityOverriddenById: input.actor.actorUserId,
      },
    })) as TicketRecord;
    await auditBulkTicketChange({
      prisma: input.prisma,
      before: ticket,
      after: next,
      context: input.actor,
      reason: ticketChangeLogReasons.bulkPriority,
      action: `${ticketSystemEventActions.ticketBulkPriority}:${reason}`,
      batchId: input.batchId,
      messages: input.messages,
    });
    updated.push(next);
    if (next.priority !== ticket.priority) {
      await applyTicketSlaTimers(input.actor, {
        ticket: next,
        now,
        event: 'priority_changed',
      });
    }
  }
  return updated;
}
