import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRecord } from '../../tickets/tickets.types';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';

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
    return resolveEscalationTargetRecipients(prisma, ruleId);
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
): Promise<readonly string[]> {
  const rule = await prisma.slaEscalationRule.findUnique({
    where: { id: ruleId },
    select: {
      targetGroupId: true,
      targetRole: true,
      targetUserId: true,
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
