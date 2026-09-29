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

export async function resolveSlaNotificationRecipients(
  prisma: PrismaService,
  input: {
    readonly ticket: TicketRecord;
    readonly event?: string;
    readonly messageBody?: string;
  },
): Promise<readonly string[]> {
  if (input.event !== undefined && escalationActions.has(input.event)) {
    const ruleId = parseEscalationRuleId(input.messageBody);
    if (ruleId === null) {
      return [];
    }
    return resolveEscalationTargetRecipients(prisma, ruleId, input.ticket.id);
  }
  return [
    ...(input.ticket.assignedUserId === null
      ? []
      : [input.ticket.assignedUserId]),
    ...(await groupMemberUserIds(prisma, input.ticket.assignedGroupId)),
  ];
}

function parseEscalationRuleId(messageBody: string | undefined): string | null {
  if (messageBody === undefined || messageBody.length === 0) {
    return null;
  }
  const separator = messageBody.indexOf(':');
  if (separator <= 0 || separator === messageBody.length - 1) {
    return null;
  }
  return messageBody.slice(separator + 1);
}

async function resolveEscalationTargetRecipients(
  prisma: PrismaService,
  ruleId: string,
  ticketId: string,
): Promise<readonly string[]> {
  const rule = await prisma.slaEscalationRule.findUnique({
    where: { id: ruleId },
    select: {
      targetGroupId: true,
      targetRole: true,
      targetUserId: true,
      targetOnCall: true,
    },
  });
  if (rule === null) {
    return [];
  }
  if (rule.targetUserId !== null) {
    return [rule.targetUserId];
  }
  if (rule.targetRole !== null) {
    const assignments = await prisma.userRole.findMany({
      where: { role: { key: rule.targetRole } },
      select: { userId: true },
    });
    return assignments.map((assignment) => assignment.userId);
  }
  if (rule.targetOnCall && rule.targetGroupId !== null) {
    // Paket 2.9 (K3, §4.3): the concrete on-call agent at the moment of the
    // escalation; nobody on call → the whole group (never a silent gap).
    const onCallUserId = await findOnCallUserId(prisma, rule.targetGroupId);
    if (onCallUserId !== null) {
      await recordAuditEntry(prisma as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.onCallEscalationNotified,
        entityType: auditLogEntityTypes.ticket,
        entityId: ticketId,
        metadata: { ruleId, groupId: rule.targetGroupId, userId: onCallUserId },
        actorUserId: null,
      }).catch(() => undefined);
      return [onCallUserId];
    }
  }
  return groupMemberUserIds(prisma, rule.targetGroupId);
}

async function groupMemberUserIds(
  prisma: PrismaService,
  groupId: string | null,
): Promise<readonly string[]> {
  if (groupId === null) {
    return [];
  }
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}
