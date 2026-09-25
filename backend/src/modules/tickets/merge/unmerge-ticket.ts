import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { changeLogActions } from '../../change-log/change-log.constants';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { applyTicketSlaTimers } from '../apply-ticket-sla-timers';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { loadTicketRecord } from '../load-ticket-record';
import { registerMessageTicket } from '../publish-persisted-ticket-messages';
import { recordTicketChange } from '../record-ticket-change';
import { redactSensitiveText } from '../redaction/redact-sensitive-text';
import type { TicketRedactionConfiguration } from '../redaction/redaction.types';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { hasTicketPermission } from './has-ticket-permission';
import { terminalTicketStatuses } from './merge.constants';
import { normalizeRequiredReason } from './normalize-merge-reason';

/**
 * Package 1.2, M6 — `POST /tickets/:id/unmerge` on the child.
 *  - A child that already followed the parent into RESOLVED/CLOSED keeps that
 *    status (it can be reopened by the reopen policy); otherwise it goes back
 *    to IN_PROGRESS.
 *  - The SLA clock restarts now; the merged time counts as a pause.
 *  - The child's requester loses read access to the parent, unless another of
 *    their tickets is still merged into it.
 */
export async function unmergeTicket(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly redaction?: TicketRedactionConfiguration;
  readonly ticketId: string;
  readonly reason: string;
  readonly context: TicketMutationContext;
  readonly messages: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const { ticket: child, access } = await loadAccessibleTicket(
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
    !hasTicketPermission(authContext, permissionKeys.ticketMerge)
  ) {
    throw new TicketsError('FORBIDDEN');
  }
  if (child.mergedIntoTicketId === null) {
    throw new TicketsError('TICKET_NOT_MERGED');
  }
  const normalized = normalizeRequiredReason(input.reason, 'MERGE_REASON_REQUIRED');
  const reason =
    input.redaction === undefined
      ? normalized
      : redactSensitiveText(normalized, input.redaction);
  const parent = await loadTicketRecord(input.prisma, child.mergedIntoTicketId);
  const nextStatus = terminalTicketStatuses.includes(child.status)
    ? child.status
    : 'IN_PROGRESS';
  const now = new Date();
  const updated = await input.prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    const after = (await tx.ticket.update({
      where: { id: child.id },
      data: {
        mergedIntoTicketId: null,
        mergedAt: null,
        mergedById: null,
        status: nextStatus,
        ...applyTicketLifecycleTimestamps({ current: child, nextStatus, now }),
      },
    })) as TicketRecord;
    registerMessageTicket(input.messages, parent);
    await recordTicketChange(tx, {
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.unmerge,
      before: child,
      after,
      actorUserId: input.context.actorUserId,
      redaction: input.redaction,
      safeLogging: input.context.safeLogging,
    });
    for (const [entity, metadata] of [
      [child, { role: 'child', parentTicketId: parent.id, reason }],
      [parent, { role: 'parent', childTicketId: child.id, reason }],
    ] as const) {
      await recordAuditEntry(tx as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.ticketUnmerged,
        entityType: auditLogEntityTypes.ticket,
        entityId: entity.id,
        metadata,
        actorUserId: input.context.actorUserId,
        organizationalUnitId: entity.originUnitId,
      });
    }
    input.messages.push(
      await insertSystemTicketEvent(tx, {
        ticketId: child.id,
        action: ticketSystemEventActions.ticketUnmerged,
        actorUserId: input.context.actorUserId,
        detail: `${parent.ticketNumber}:${reason}`,
      }),
      await insertSystemTicketEvent(tx, {
        ticketId: parent.id,
        action: ticketSystemEventActions.ticketUnmerged,
        actorUserId: input.context.actorUserId,
        detail: `${child.ticketNumber}:${reason}`,
      }),
    );
    const stillMerged = await tx.ticket.findFirst({
      where: { mergedIntoTicketId: parent.id, requesterId: child.requesterId },
      select: { id: true },
    });
    if (stillMerged === null) {
      await tx.ticketParticipant.deleteMany({
        where: {
          ticketId: parent.id,
          userId: child.requesterId,
          role: 'MERGED_REQUESTER',
        },
      });
    }
    return after;
  });
  await applyTicketSlaTimers(input.context, {
    ticket: updated,
    previousStatus: child.status,
    now,
    event: 'unmerged',
  });
  return updated;
}
