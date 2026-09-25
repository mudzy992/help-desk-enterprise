import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPriority } from '../../../generated/prisma/enums';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { changeLogActions } from '../../change-log/change-log.constants';
import { applyTicketSlaTimers } from '../apply-ticket-sla-timers';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { assertPriorityEditable } from '../merge/assert-ticket-editable';
import { hasTicketPermission } from '../merge/has-ticket-permission';
import { normalizeRequiredReason } from '../merge/normalize-merge-reason';
import { recordTicketChange } from '../record-ticket-change';
import { redactSensitiveText } from '../redaction/redact-sensitive-text';
import type { TicketRedactionConfiguration } from '../redaction/redaction.types';
import { resolveTicketPriority } from '../resolve-ticket-priority';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';

export type OverrideTicketPriorityInput = {
  readonly priority?: TicketPriority;
  readonly resetToMatrix?: boolean;
  readonly reason: string;
};

const priorities: readonly TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * Package 1.2 (P2/P3): `POST /tickets/:id/priority`. Sets the priority by
 * hand (the matrix no longer applies to the ticket) or hands it back to the
 * impact × urgency matrix. The SLA targets follow the new priority (P5).
 */
export async function overrideTicketPriority(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly redaction?: TicketRedactionConfiguration;
  readonly ticketId: string;
  readonly body: OverrideTicketPriorityInput;
  readonly context: TicketMutationContext;
  readonly messages: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const { ticket, access } = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
    { writable: true },
  );
  const authContext = await input.authorizationContextLoader.loadBySubjectId(
    input.context.actorUserId,
  );
  if (
    access.visibility !== 'staff' ||
    authContext === null ||
    !hasTicketPermission(authContext, permissionKeys.ticketPriorityOverride)
  ) {
    throw new TicketsError('FORBIDDEN');
  }
  assertPriorityEditable(ticket);
  const normalizedReason = normalizeRequiredReason(
    input.body.reason,
    'PRIORITY_REASON_REQUIRED',
  );
  const reason =
    input.redaction === undefined
      ? normalizedReason
      : redactSensitiveText(normalizedReason, input.redaction);
  const plan = await planPriority(input.prisma, ticket, input.body);
  const now = new Date();
  const updated = await input.prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    const after = (await tx.ticket.update({
      where: { id: ticket.id },
      data: plan.reset
        ? {
            priority: plan.priority,
            priorityOverridden: false,
            priorityOverriddenAt: null,
            priorityOverriddenById: null,
          }
        : {
            priority: plan.priority,
            priorityOverridden: true,
            priorityOverriddenAt: now,
            priorityOverriddenById: input.context.actorUserId,
          },
    })) as TicketRecord;
    await recordTicketChange(tx, {
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.priorityOverride,
      before: ticket,
      after,
      actorUserId: input.context.actorUserId,
      redaction: input.redaction,
      safeLogging: input.context.safeLogging,
    });
    await recordAuditEntry(tx as unknown as AuditLogTransactionalClient, {
      action: auditLogActions.ticketPriorityOverridden,
      entityType: auditLogEntityTypes.ticket,
      entityId: ticket.id,
      metadata: {
        from: ticket.priority,
        to: after.priority,
        resetToMatrix: plan.reset,
        reason,
      },
      actorUserId: input.context.actorUserId,
      organizationalUnitId: ticket.originUnitId,
    });
    input.messages.push(
      await insertSystemTicketEvent(tx, {
        ticketId: ticket.id,
        action: ticketSystemEventActions.priorityOverridden,
        actorUserId: input.context.actorUserId,
        detail: formatPriorityEventDetail(ticket.priority, after.priority, plan.reset, reason),
      }),
    );
    return after;
  });
  if (updated.priority !== ticket.priority) {
    await applyTicketSlaTimers(input.context, {
      ticket: updated,
      now,
      event: 'priority_changed',
    });
  }
  return updated;
}

async function planPriority(
  prisma: PrismaService,
  ticket: TicketRecord,
  body: OverrideTicketPriorityInput,
): Promise<{ readonly priority: TicketPriority; readonly reset: boolean }> {
  if (body.resetToMatrix === true) {
    if (ticket.priorityOverridden !== true) {
      throw new TicketsError('PRIORITY_NOT_OVERRIDDEN');
    }
    return {
      priority: await resolveTicketPriority(prisma, ticket.impact, ticket.urgency),
      reset: true,
    };
  }
  const priority = body.priority;
  if (priority === undefined || !priorities.includes(priority)) {
    throw new TicketsError('PRIORITY_REQUIRED');
  }
  if (priority === ticket.priority) {
    throw new TicketsError('PRIORITY_UNCHANGED');
  }
  return { priority, reset: false };
}

/**
 * System event body `ticket_priority_overridden:FROM:TO:MODE:reason`, MODE is
 * `manual` or `matrix`. The reason goes last so it may contain colons.
 */
export function formatPriorityEventDetail(
  from: TicketPriority,
  to: TicketPriority,
  reset: boolean,
  reason: string,
): string {
  return `${from}:${to}:${reset ? 'matrix' : 'manual'}:${reason}`;
}
