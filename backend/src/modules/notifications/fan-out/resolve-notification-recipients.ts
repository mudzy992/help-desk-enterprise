import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRecord } from '../../tickets/tickets.types';
import {
  notificationTypes,
  type NotificationType,
} from '../notifications.constants';
import { resolveSlaNotificationRecipients } from './resolve-sla-notification-recipients';

export async function resolveNotificationRecipients(
  prisma: PrismaService,
  input: {
    readonly type: NotificationType;
    readonly ticket: TicketRecord;
    readonly actorUserId: string | null;
    readonly event?: string;
    readonly messageBody?: string;
  },
): Promise<readonly string[]> {
  const recipients = await collectRecipients(prisma, input);
  return unique(
    recipients.filter(
      (userId) => userId.length > 0 && userId !== input.actorUserId,
    ),
  );
}

async function collectRecipients(
  prisma: PrismaService,
  input: {
    readonly type: NotificationType;
    readonly ticket: TicketRecord;
    readonly event?: string;
    readonly messageBody?: string;
  },
): Promise<readonly string[]> {
  switch (input.type) {
    case notificationTypes.ticketCreated:
      return groupMemberUserIds(prisma, input.ticket.assignedGroupId, [
        input.ticket.assignedUserId,
      ]);
    case notificationTypes.ticketAssigned:
      return input.ticket.assignedUserId === null
        ? []
        : [input.ticket.assignedUserId];
    case notificationTypes.ticketResolved:
    case notificationTypes.ticketClosed:
      return [input.ticket.requesterId];
    case notificationTypes.ticketApproval:
      return participantUserIds(prisma, input.ticket.id, 'APPROVER');
    case notificationTypes.ticketSla:
      return resolveSlaNotificationRecipients(prisma, input);
    case notificationTypes.remoteRequested:
      return [input.ticket.requesterId];
    case notificationTypes.ticketMessage:
      return [
        input.ticket.requesterId,
        ...(input.ticket.assignedUserId === null
          ? []
          : [input.ticket.assignedUserId]),
        ...(await groupMemberUserIds(prisma, input.ticket.assignedGroupId)),
        ...(await participantUserIds(prisma, input.ticket.id, 'WATCHER')),
      ];
    default:
      return [];
  }
}

async function groupMemberUserIds(
  prisma: PrismaService,
  groupId: string | null,
  excludeUserIds: readonly (string | null)[] = [],
): Promise<readonly string[]> {
  if (groupId === null) {
    return [];
  }
  const excluded = new Set(excludeUserIds.filter((id) => id !== null));
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  return members
    .map((member) => member.userId)
    .filter((userId) => !excluded.has(userId));
}

async function participantUserIds(
  prisma: PrismaService,
  ticketId: string,
  role: 'WATCHER' | 'APPROVER',
): Promise<readonly string[]> {
  const rows = await prisma.ticketParticipant.findMany({
    where: { ticketId, role },
    select: { userId: true },
  });
  return rows
    .map((row) => row.userId)
    .filter((userId): userId is string => userId !== null);
}

function unique(userIds: readonly string[]): readonly string[] {
  return [...new Set(userIds)];
}
