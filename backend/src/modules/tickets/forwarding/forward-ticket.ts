import { PrismaService } from '../../../common/prisma/prisma.service';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../../authorization/authorization.constants';
import { doesOrganizationalUnitScopeCover } from '../../authorization/does-organizational-unit-scope-cover';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { changeLogActions } from '../../change-log/change-log.constants';
import { hasTicketStaffRole } from '../authorize-ticket-actor';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { recordTicketChange } from '../record-ticket-change';
import { redactSensitiveText } from '../redaction/redact-sensitive-text';
import type { TicketRedactionConfiguration } from '../redaction/redaction.types';
import { syncAssigneeParticipant } from '../sync-assignee-participant';
import { syncHandlerGroupParticipant } from '../sync-handler-group-participant';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import {
  forwardableTicketStatuses,
  ticketForwardingConstants,
} from './forwarding.constants';
import type {
  ForwardTicketInput,
  TicketForwardEventRecord,
  TicketForwardingConfiguration,
} from './forwarding.types';

type TargetGroup = {
  readonly id: string;
  readonly name: string;
  readonly organizationalUnitId: string;
};

/** Everything validated; applying it only writes. */
export type TicketForwardPlan = {
  readonly ticket: TicketRecord;
  readonly target: TargetGroup;
  readonly targetUserId: string | null;
  readonly fromGroup: { readonly id: string; readonly name: string } | null;
  readonly fromUnitId: string;
  readonly isCrossOu: boolean;
  readonly reason: string;
};

/**
 * Package 1.1 — single-ticket forward (`POST /tickets/:id/forward`).
 * Validation (`planTicketForward`) and writes (`applyTicketForward`) are split
 * so the bulk "assign group" action goes through exactly the same rules.
 */
export async function forwardTicket(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly configuration: TicketForwardingConfiguration;
  readonly redaction?: TicketRedactionConfiguration;
  readonly ticketId: string;
  readonly body: ForwardTicketInput;
  readonly context: TicketMutationContext;
  readonly messages: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const loaded = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
    { writable: true },
  );
  if (loaded.access.visibility !== 'staff') {
    throw new TicketsError('FORBIDDEN');
  }
  const authContext = await input.authorizationContextLoader.loadBySubjectId(
    input.context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const plan = await planTicketForward({
    prisma: input.prisma,
    authorizationContextLoader: input.authorizationContextLoader,
    configuration: input.configuration,
    authContext,
    ticket: loaded.ticket,
    body: input.body,
  });
  return applyTicketForward({
    prisma: input.prisma,
    plan,
    configuration: input.configuration,
    redaction: input.redaction,
    actorUserId: input.context.actorUserId,
    keepMeAsWatcher: input.body.keepMeAsWatcher === true,
    viaBulk: false,
    messages: input.messages,
  });
}

export async function planTicketForward(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly configuration: TicketForwardingConfiguration;
  readonly authContext: AuthorizationContext;
  readonly ticket: TicketRecord;
  readonly body: ForwardTicketInput;
}): Promise<TicketForwardPlan> {
  const { ticket, authContext } = input;
  assertForwardableTicket(ticket);
  await assertMayForwardFromCurrentGroup(input.prisma, authContext, ticket);
  const target = await loadGroup(input.prisma, input.body.targetGroupId);
  if (target === null) {
    throw new TicketsError('HANDLER_GROUP_NOT_FOUND');
  }
  if (target.id === ticket.assignedGroupId) {
    throw new TicketsError('FORWARD_SAME_GROUP');
  }
  const fromGroup =
    ticket.assignedGroupId === null
      ? null
      : await loadGroup(input.prisma, ticket.assignedGroupId);
  const fromUnitId = fromGroup?.organizationalUnitId ?? ticket.originUnitId;
  const isCrossOu = target.organizationalUnitId !== fromUnitId;
  if (isCrossOu) {
    await assertMayForwardCrossOu(input.prisma, {
      context: authContext,
      configuration: input.configuration,
      unitIds: [ticket.originUnitId, fromUnitId],
    });
  }
  const reason = normalizeForwardReason(input.body.reason, input.configuration);
  const targetUserId = await resolveTargetUser(
    input.prisma,
    input.authorizationContextLoader,
    target.id,
    input.body.targetUserId,
  );
  return {
    ticket,
    target,
    targetUserId,
    fromGroup:
      fromGroup === null ? null : { id: fromGroup.id, name: fromGroup.name },
    fromUnitId,
    isCrossOu,
    reason,
  };
}

export async function applyTicketForward(input: {
  readonly prisma: PrismaService;
  readonly plan: TicketForwardPlan;
  readonly configuration: TicketForwardingConfiguration;
  readonly redaction?: TicketRedactionConfiguration;
  readonly actorUserId: string;
  readonly keepMeAsWatcher: boolean;
  readonly viaBulk: boolean;
  readonly batchId?: string | null;
  readonly messages: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const { plan } = input;
  const before = plan.ticket;
  const reason =
    input.redaction === undefined
      ? plan.reason
      : redactSensitiveText(plan.reason, input.redaction);
  return input.prisma.$transaction(async (transaction) => {
    const tx = transaction as PrismaService;
    const after = (await tx.ticket.update({
      where: { id: before.id },
      data: {
        assignedGroupId: plan.target.id,
        assignedUserId: plan.targetUserId,
        status: nextStatusAfterForward(before, plan.targetUserId),
      },
    })) as TicketRecord;
    await rewriteParticipants(tx, {
      before,
      after,
      fromGroupId: plan.fromGroup?.id ?? null,
      keepPreviousAssignee:
        input.configuration.keepPreviousHandlersAsWatchers,
      watcherUserId: input.keepMeAsWatcher ? input.actorUserId : null,
    });
    const event = (await tx.ticketForwardEvent.create({
      data: {
        ticketId: before.id,
        fromGroupId: plan.fromGroup?.id ?? null,
        fromGroupName: plan.fromGroup?.name ?? null,
        fromUnitId: plan.fromUnitId,
        toGroupId: plan.target.id,
        toGroupName: plan.target.name,
        toUnitId: plan.target.organizationalUnitId,
        toUserId: plan.targetUserId,
        previousAssigneeId: before.assignedUserId,
        actorUserId: input.actorUserId,
        reason,
        isCrossOu: plan.isCrossOu,
        requesterNotified: input.configuration.notifyRequester,
        viaBulk: input.viaBulk,
      },
    })) as TicketForwardEventRecord;
    await recordTicketChange(tx, {
      action: changeLogActions.update,
      reason: input.viaBulk
        ? ticketChangeLogReasons.bulkAssign
        : ticketChangeLogReasons.forward,
      before,
      after,
      actorUserId: input.actorUserId,
      redaction: input.redaction,
    });
    await recordAuditEntry(tx as unknown as AuditLogTransactionalClient, {
      action: auditLogActions.ticketForwarded,
      entityType: auditLogEntityTypes.ticket,
      entityId: before.id,
      metadata: {
        forwardEventId: event.id,
        fromGroupId: event.fromGroupId,
        toGroupId: event.toGroupId,
        fromUnitId: event.fromUnitId,
        toUnitId: event.toUnitId,
        toUserId: event.toUserId,
        isCrossOu: event.isCrossOu,
        viaBulk: event.viaBulk,
        batchId: input.batchId ?? null,
        reason,
      },
      actorUserId: input.actorUserId,
      organizationalUnitId: before.originUnitId,
    });
    input.messages.push(
      await insertSystemTicketEvent(tx, {
        ticketId: before.id,
        action: ticketSystemEventActions.forwarded,
        actorUserId: input.actorUserId,
        detail: event.id,
      }),
    );
    return after;
  });
}

export function assertForwardableTicket(ticket: TicketRecord): void {
  if (
    ticket.mergedIntoTicketId !== null ||
    !(forwardableTicketStatuses as readonly string[]).includes(ticket.status)
  ) {
    throw new TicketsError('FORWARD_NOT_ALLOWED_IN_STATUS');
  }
}

/**
 * Decision D4: the SLA clock keeps running, the assignee is cleared and the
 * ticket waits for the new group (`PENDING`), or goes straight to the chosen
 * agent (`ASSIGNED`). A ticket waiting for the user keeps waiting: the SLA
 * pause belongs to the user, not to the group.
 */
export function nextStatusAfterForward(
  ticket: TicketRecord,
  targetUserId: string | null,
): TicketRecord['status'] {
  if (ticket.status === 'WAITING_FOR_USER') {
    return ticket.status;
  }
  return targetUserId === null ? 'PENDING' : 'ASSIGNED';
}

export function normalizeForwardReason(
  reason: string | undefined,
  configuration: TicketForwardingConfiguration,
): string {
  const normalized = (reason ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length > ticketForwardingConstants.maximumReasonLength) {
    throw new TicketsError('FORWARD_REASON_REQUIRED');
  }
  if (
    configuration.requireReason &&
    normalized.length < configuration.minReasonLength
  ) {
    throw new TicketsError('FORWARD_REASON_REQUIRED');
  }
  return normalized;
}

/**
 * An AGENT-only actor forwards only work of their own current group (or a
 * ticket they are assigned to); ADMIN and SuperAdmin forward anything they
 * can manage. Same rule as the bulk assign action.
 */
async function assertMayForwardFromCurrentGroup(
  prisma: PrismaService,
  context: AuthorizationContext,
  ticket: TicketRecord,
): Promise<void> {
  if (context.isSuperAdmin || ticket.assignedGroupId === null) {
    return;
  }
  const isAgentOnly = context.assignments.every(
    (assignment) => assignment.roleKey === authorizationRoleKeys.agent,
  );
  if (!isAgentOnly || ticket.assignedUserId === context.subjectId) {
    return;
  }
  const membership = await prisma.groupMember.findFirst({
    where: { groupId: ticket.assignedGroupId, userId: context.subjectId },
    select: { id: true },
  });
  if (membership === null) {
    throw new TicketsError('FORBIDDEN');
  }
}

/**
 * Decision D3: cross-OU needs the setting AND `ticket.forward.cross_ou` in an
 * assignment whose OU scope covers the ticket's OU or the OU of the group that
 * handles it now (so Direkcija can hand a Zenica ticket back to Zenica).
 */
async function assertMayForwardCrossOu(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly configuration: TicketForwardingConfiguration;
    readonly unitIds: readonly string[];
  },
): Promise<void> {
  if (!input.configuration.allowCrossOu) {
    throw new TicketsError('FORWARD_CROSS_OU_DISABLED');
  }
  if (input.context.isSuperAdmin) {
    return;
  }
  const paths: string[] = [];
  for (const unitId of new Set(input.unitIds)) {
    const path = await loadOrganizationalUnitPath(prisma, unitId);
    if (path !== null) {
      paths.push(path);
    }
  }
  if (!hasCrossOuForwardPermission(input.context, paths)) {
    throw new TicketsError('FORWARD_CROSS_OU_FORBIDDEN');
  }
}

export function hasCrossOuForwardPermission(
  context: AuthorizationContext,
  unitPaths: readonly string[],
): boolean {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.assignments.some(
    (assignment) =>
      assignment.permissionKeys.includes(permissionKeys.ticketForwardCrossOu) &&
      unitPaths.some((requestedPath) =>
        doesOrganizationalUnitScopeCover({
          assignedPath: assignment.organizationalUnitPath,
          requestedPath,
        }),
      ),
  );
}

async function resolveTargetUser(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  groupId: string,
  targetUserId: string | undefined,
): Promise<string | null> {
  const userId = targetUserId?.trim() ?? '';
  if (userId.length === 0) {
    return null;
  }
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
    select: { id: true },
  });
  const context =
    membership === null
      ? null
      : await authorizationContextLoader.loadBySubjectId(userId);
  if (context === null || !hasTicketStaffRole(context)) {
    throw new TicketsError('FORWARD_TARGET_USER_NOT_MEMBER');
  }
  return userId;
}

async function loadGroup(
  prisma: PrismaService,
  groupId: string | undefined,
): Promise<TargetGroup | null> {
  const id = groupId?.trim() ?? '';
  if (id.length === 0) {
    return null;
  }
  return (await prisma.group.findUnique({
    where: { id },
    select: { id: true, name: true, organizationalUnitId: true },
  })) as TargetGroup | null;
}

/**
 * Participants after a forward:
 *  - FORWARDED_FROM_GROUP (old group) and FORWARDED_TO_GROUP (new group);
 *  - HANDLER_GROUP only for the current group (the old row is dropped: the
 *    history lives in FORWARDED_* and TicketForwardEvent);
 *  - the previous assignee loses the ASSIGNEE row (it grants access to
 *    confidential tickets) and becomes a WATCHER only if the policy says so;
 *  - the forwarding agent becomes a WATCHER on request.
 */
async function rewriteParticipants(
  prisma: PrismaService,
  input: {
    readonly before: TicketRecord;
    readonly after: TicketRecord;
    readonly fromGroupId: string | null;
    readonly keepPreviousAssignee: boolean;
    readonly watcherUserId: string | null;
  },
): Promise<void> {
  const ticketId = input.after.id;
  const existing = (await prisma.ticketParticipant.findMany({
    where: { ticketId },
  })) as { id: string; role: string; userId: string | null; groupId: string | null }[];
  for (const row of existing) {
    const staleHandler =
      row.role === 'HANDLER_GROUP' && row.groupId !== input.after.assignedGroupId;
    const staleAssignee =
      row.role === 'ASSIGNEE' && row.userId !== input.after.assignedUserId;
    if (staleHandler || staleAssignee) {
      await prisma.ticketParticipant.delete({ where: { id: row.id } });
    }
  }
  const has = (role: string, key: 'userId' | 'groupId', id: string) =>
    existing.some((row) => row.role === role && row[key] === id);
  const addGroup = async (role: 'FORWARDED_FROM_GROUP' | 'FORWARDED_TO_GROUP', groupId: string) => {
    if (!has(role, 'groupId', groupId)) {
      await prisma.ticketParticipant.create({
        data: { ticketId, role, groupId },
      });
    }
  };
  const addWatcher = async (userId: string) => {
    if (!has('WATCHER', 'userId', userId)) {
      existing.push({ id: '', role: 'WATCHER', userId, groupId: null });
      await prisma.ticketParticipant.create({
        data: { ticketId, role: 'WATCHER', userId },
      });
    }
  };
  if (input.fromGroupId !== null) {
    await addGroup('FORWARDED_FROM_GROUP', input.fromGroupId);
  }
  if (input.after.assignedGroupId !== null) {
    await addGroup('FORWARDED_TO_GROUP', input.after.assignedGroupId);
  }
  await syncHandlerGroupParticipant(prisma, input.after);
  await syncAssigneeParticipant(prisma, input.after);
  const previousAssignee = input.before.assignedUserId;
  if (
    input.keepPreviousAssignee &&
    previousAssignee !== null &&
    previousAssignee !== input.after.assignedUserId
  ) {
    await addWatcher(previousAssignee);
  }
  if (
    input.watcherUserId !== null &&
    input.watcherUserId !== input.after.assignedUserId
  ) {
    await addWatcher(input.watcherUserId);
  }
}
