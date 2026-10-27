import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRecord } from '../../tickets/tickets.types';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { findOnCallUserId } from '../../on-call/on-call-data';

const escalationActions = new Set<string>([
  ticketSystemEventActions.slaResponseEscalated,
  ticketSystemEventActions.slaResolutionEscalated,
]);

type TicketScope = { readonly organizationalUnitId: string; readonly organizationalUnitPath: string; readonly serviceId: string };
type ScopedAssignment = { readonly serviceId: string | null; readonly organizationalUnitId: string | null };

export async function resolveSlaNotificationRecipients(
  prisma: PrismaService,
  input: { readonly ticket: TicketRecord; readonly event?: string; readonly messageBody?: string },
): Promise<readonly string[]> {
  if (input.event !== undefined && escalationActions.has(input.event)) {
    const ruleId = parseEscalationRuleId(input.messageBody);
    if (ruleId === null) return fallbackOrAlarm(prisma, input.ticket, null, 'invalid_rule_reference');
    return resolveEscalationTargetRecipients(prisma, ruleId, input.ticket);
  }
  return activeHandlerRecipients(prisma, input.ticket);
}

function parseEscalationRuleId(messageBody: string | undefined): string | null {
  if (messageBody === undefined || messageBody.length === 0) return null;
  const separator = messageBody.indexOf(':');
  return separator <= 0 || separator === messageBody.length - 1 ? null : messageBody.slice(separator + 1);
}

async function resolveEscalationTargetRecipients(
  prisma: PrismaService,
  ruleId: string,
  ticket: TicketRecord,
): Promise<readonly string[]> {
  const [rule, scope] = await Promise.all([
    prisma.slaEscalationRule.findUnique({
      where: { id: ruleId },
      select: { targetGroupId: true, targetRole: true, targetUserId: true, targetOnCall: true },
    }),
    loadTicketScope(prisma, ticket),
  ]);
  if (rule === null) return fallbackOrAlarm(prisma, ticket, ruleId, 'rule_missing');

  let recipients: readonly string[] = [];
  if (rule.targetUserId !== null) {
    recipients = await eligibleExplicitUsers(prisma, [rule.targetUserId], scope);
  } else if (rule.targetRole !== null) {
    recipients = await eligibleRoleUsers(prisma, rule.targetRole, scope);
  } else if (rule.targetGroupId !== null) {
    if (rule.targetOnCall) {
      const onCallUserId = await findOnCallUserId(prisma, rule.targetGroupId);
      if (onCallUserId !== null) {
        recipients = await eligibleGroupUsers(prisma, rule.targetGroupId, scope, [onCallUserId]);
        if (recipients.length > 0) {
          await recordAuditEntry(prisma as unknown as AuditLogTransactionalClient, {
            action: auditLogActions.onCallEscalationNotified,
            entityType: auditLogEntityTypes.ticket,
            entityId: ticket.id,
            metadata: { ruleId, groupId: rule.targetGroupId, userId: onCallUserId },
            actorUserId: null,
          });
        }
      }
    }
    if (recipients.length === 0) recipients = await eligibleGroupUsers(prisma, rule.targetGroupId, scope);
  }
  return recipients.length > 0
    ? recipients
    : fallbackOrAlarm(prisma, ticket, ruleId, 'configured_audience_empty');
}

async function loadTicketScope(prisma: PrismaService, ticket: TicketRecord): Promise<TicketScope> {
  const unit = await prisma.organizationalUnit.findUnique({ where: { id: ticket.originUnitId }, select: { ouPath: true } });
  return { organizationalUnitId: ticket.originUnitId, organizationalUnitPath: unit?.ouPath ?? '', serviceId: ticket.serviceId };
}

function pathContains(scopePath: string, targetPath: string): boolean {
  return scopePath.length > 0 && (scopePath === targetPath || targetPath.startsWith(`${scopePath}/`));
}

async function assignmentMatches(
  prisma: PrismaService,
  assignment: ScopedAssignment,
  scope: TicketScope,
): Promise<boolean> {
  if (assignment.serviceId !== null && assignment.serviceId !== scope.serviceId) return false;
  if (assignment.organizationalUnitId === null) return true;
  const unit = await prisma.organizationalUnit.findUnique({
    where: { id: assignment.organizationalUnitId },
    select: { ouPath: true },
  });
  return unit !== null && pathContains(unit.ouPath, scope.organizationalUnitPath);
}

async function activeUserIds(prisma: PrismaService, userIds: readonly string[]): Promise<readonly string[]> {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, isActive: true, anonymizedAt: true },
  });
  return users
    .filter((user) => user.isActive !== false && (user.anonymizedAt === null || user.anonymizedAt === undefined))
    .map((user) => user.id);
}

async function eligibleExplicitUsers(prisma: PrismaService, userIds: readonly string[], scope: TicketScope): Promise<readonly string[]> {
  const activeIds = await activeUserIds(prisma, userIds);
  if (activeIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...activeIds] } },
    select: { id: true, organizationalUnitId: true },
  });
  const assignments = hasUserRoleDelegate(prisma)
    ? await prisma.userRole.findMany({
        where: { userId: { in: [...activeIds] } },
        select: { userId: true, serviceId: true, organizationalUnitId: true },
      })
    : [];
  const eligible: string[] = [];
  for (const user of users) {
    let directScope = false;
    if (user.organizationalUnitId !== null && user.organizationalUnitId !== undefined) {
      const unit = await prisma.organizationalUnit.findUnique({ where: { id: user.organizationalUnitId }, select: { ouPath: true } });
      directScope = unit !== null && pathContains(unit.ouPath, scope.organizationalUnitPath);
    }
    const scopedAssignments = assignments.filter((assignment) => assignment.userId === user.id);
    const assignmentScope = (await Promise.all(scopedAssignments.map((assignment) => assignmentMatches(prisma, assignment, scope)))).some(Boolean);
    if (directScope || assignmentScope) eligible.push(user.id);
  }
  return eligible;
}

async function eligibleRoleUsers(prisma: PrismaService, roleKey: string, scope: TicketScope): Promise<readonly string[]> {
  if (!hasUserRoleDelegate(prisma)) return [];
  const assignments = await prisma.userRole.findMany({
    where: { role: { key: roleKey } },
    select: { userId: true, serviceId: true, organizationalUnitId: true },
  });
  const scoped: string[] = [];
  for (const assignment of assignments) {
    if (await assignmentMatches(prisma, assignment, scope)) scoped.push(assignment.userId);
  }
  return activeUserIds(prisma, unique(scoped));
}

async function eligibleGroupUsers(
  prisma: PrismaService,
  groupId: string,
  scope: TicketScope,
  onlyUserIds?: readonly string[],
): Promise<readonly string[]> {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { organizationalUnitId: true } });
  if (group === null) return [];
  const unit = await prisma.organizationalUnit.findUnique({ where: { id: group.organizationalUnitId }, select: { ouPath: true } });
  if (unit === null || !pathContains(unit.ouPath, scope.organizationalUnitPath)) return [];
  const members = await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
  const selected = onlyUserIds === undefined
    ? members.map((member) => member.userId)
    : members.filter((member) => onlyUserIds.includes(member.userId)).map((member) => member.userId);
  return activeUserIds(prisma, selected);
}

async function activeHandlerRecipients(prisma: PrismaService, ticket: TicketRecord): Promise<readonly string[]> {
  const scope = await loadTicketScope(prisma, ticket);
  const groupRecipients = ticket.assignedGroupId === null ? [] : await eligibleGroupUsers(prisma, ticket.assignedGroupId, scope);
  const assigned = ticket.assignedUserId === null
    ? []
    : groupRecipients.includes(ticket.assignedUserId)
      ? [ticket.assignedUserId]
      : await eligibleExplicitUsers(prisma, [ticket.assignedUserId], scope);
  return unique([...assigned, ...groupRecipients]);
}

async function fallbackOrAlarm(
  prisma: PrismaService,
  ticket: TicketRecord,
  ruleId: string | null,
  reason: string,
): Promise<readonly string[]> {
  const fallback = await activeHandlerRecipients(prisma, ticket);
  if (fallback.length > 0) return fallback;
  await recordAuditEntry(prisma as unknown as AuditLogTransactionalClient, {
    action: auditLogActions.slaEscalationAudienceEmpty,
    entityType: auditLogEntityTypes.ticket,
    entityId: ticket.id,
    metadata: { ruleId, reason, serviceId: ticket.serviceId, organizationalUnitId: ticket.originUnitId },
    actorUserId: null,
  });
  return [];
}

function hasUserRoleDelegate(prisma: PrismaService): boolean {
  return typeof (prisma as unknown as { userRole?: { findMany?: unknown } }).userRole?.findMany === 'function';
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
