import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { changeLogActions } from '../../change-log/change-log.constants';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { applyTicketSlaTimers } from '../apply-ticket-sla-timers';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketMessageRecord, TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { registerMessageTicket } from '../publish-persisted-ticket-messages';
import { recordTicketChange } from '../record-ticket-change';
import type { TicketRedactionConfiguration } from '../redaction/redaction.types';
import { ticketChangeLogReasons } from '../tickets.constants';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { terminalTicketStatuses, ticketMergeTexts } from './merge.constants';

/**
 * Package 1.2, M2 — writes of a validated merge (`assertMergeAllowed` first):
 *  - child: `mergedIntoTicketId`, `mergedAt`, `mergedById`, the parent's
 *    status (and resolution, when the parent is already resolved);
 *  - a public message to the child's requester and an internal event;
 *  - the child's requester becomes a MERGED_REQUESTER participant of the
 *    parent (public read access, never internal notes);
 *  - change log and audit on both sides, one internal event on the parent;
 *  - after the transaction the child's SLA clock stops (the work runs on the
 *    parent).
 */
export async function applyTicketMerge(input: {
  readonly prisma: PrismaService;
  readonly parent: TicketRecord;
  readonly children: readonly TicketRecord[];
  readonly reason: string;
  readonly context: TicketMutationContext;
  readonly redaction?: TicketRedactionConfiguration;
  readonly messages: TicketPersistedMessageSink;
  readonly batchId?: string | null;
}): Promise<readonly TicketRecord[]> {
  const { parent, context } = input;
  const now = new Date();
  const merged = await input.prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    const updated: TicketRecord[] = [];
    for (const child of input.children) {
      const takesResolution = terminalTicketStatuses.includes(parent.status);
      const after = (await tx.ticket.update({
        where: { id: child.id },
        data: {
          mergedIntoTicketId: parent.id,
          mergedAt: now,
          mergedById: context.actorUserId,
          status: parent.status,
          ...applyTicketLifecycleTimestamps({ current: child, nextStatus: parent.status, now }),
          ...(takesResolution
            ? { closeCodeId: parent.closeCodeId, resolutionNote: parent.resolutionNote }
            : {}),
        },
      })) as TicketRecord;
      registerMessageTicket(input.messages, after);
      await recordTicketChange(tx, {
        action: changeLogActions.update,
        reason: ticketChangeLogReasons.merge,
        before: child,
        after,
        actorUserId: context.actorUserId,
        redaction: input.redaction,
        safeLogging: context.safeLogging,
      });
      await recordAuditEntry(tx as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.ticketMerged,
        entityType: auditLogEntityTypes.ticket,
        entityId: child.id,
        metadata: {
          role: 'child',
          parentTicketId: parent.id,
          parentTicketNumber: parent.ticketNumber,
          reason: input.reason,
          batchId: input.batchId ?? null,
        },
        actorUserId: context.actorUserId,
        organizationalUnitId: child.originUnitId,
      });
      input.messages.push(
        await insertSystemTicketEvent(tx, {
          ticketId: child.id,
          action: ticketSystemEventActions.ticketMergedChild,
          actorUserId: context.actorUserId,
          detail: `${parent.ticketNumber}:${input.reason}`,
        }),
        (await tx.ticketMessage.create({
          data: {
            ticketId: child.id,
            type: 'AGENT_REPLY',
            body: ticketMergeTexts.childMerged(parent.ticketNumber),
            authorUserId: context.actorUserId,
          },
        })) as TicketMessageRecord,
      );
      await addMergedRequester(tx, parent, child.requesterId);
      updated.push(after);
    }
    await recordAuditEntry(tx as unknown as AuditLogTransactionalClient, {
      action: auditLogActions.ticketMerged,
      entityType: auditLogEntityTypes.ticket,
      entityId: parent.id,
      metadata: {
        role: 'parent',
        childTicketIds: updated.map((child) => child.id),
        reason: input.reason,
        batchId: input.batchId ?? null,
      },
      actorUserId: context.actorUserId,
      organizationalUnitId: parent.originUnitId,
    });
    input.messages.push(
      await insertSystemTicketEvent(tx, {
        ticketId: parent.id,
        action: ticketSystemEventActions.ticketMerged,
        actorUserId: context.actorUserId,
        detail: `${updated.map((child) => child.ticketNumber).join(',')}:${input.reason}`,
      }),
    );
    return updated;
  });
  for (const child of merged) {
    await applyTicketSlaTimers(context, { ticket: child, now, event: 'merged' });
  }
  return merged;
}

async function addMergedRequester(
  tx: PrismaService,
  parent: TicketRecord,
  requesterId: string,
): Promise<void> {
  if (requesterId === parent.requesterId) {
    return;
  }
  const existing = await tx.ticketParticipant.findFirst({
    where: { ticketId: parent.id, userId: requesterId, role: 'MERGED_REQUESTER' },
    select: { id: true },
  });
  if (existing === null) {
    await tx.ticketParticipant.create({
      data: { ticketId: parent.id, userId: requesterId, role: 'MERGED_REQUESTER' },
    });
  }
}
