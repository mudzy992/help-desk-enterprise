import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRecord } from '../../tickets/tickets.types';
import {
  notificationTypes,
  type NotificationType,
} from '../notifications.constants';

export async function resolveNotificationRecipients(
  prisma: PrismaService,
  input: {
    readonly type: NotificationType;
    readonly ticket: TicketRecord;
    readonly actorUserId: string | null;
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
      return approverUserIds(prisma, input.ticket.id);
    case notificationTypes.ticketSla:
      return [
        ...(input.ticket.assignedUserId === null
          ? []
          : [input.ticket.assignedUserId]),
        ...(await groupMemberUserIds(prisma, input.ticket.assignedGroupId)),
      ];
    case notificationTypes.ticketMessage:
      return [
        input.ticket.requesterId,
        ...(input.ticket.assignedUserId === null
          ? []
          : [input.ticket.assignedUserId]),
        ...(await groupMemberUserIds(prisma, input.ticket.assignedGroupId)),
        ...(await watcherUserIds(prisma, input.ticket.id)),
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

async function watcherUserIds(
  prisma: PrismaService,
  ticketId: string,
): Promise<readonly string[]> {
  const watchers = await prisma.ticketParticipant.findMany({
    where: { ticketId, role: 'WATCHER' },
    select: { userId: true },
  });
  return watchers
    .map((watcher) => watcher.userId)
    .filter((userId): userId is string => userId !== null);
}

async function approverUserIds(
  prisma: PrismaService,
  ticketId: string,
): Promise<readonly string[]> {
  const approvers = await prisma.ticketParticipant.findMany({
    where: { ticketId, role: 'APPROVER' },
    select: { userId: true },
  });
  return approvers
    .map((approver) => approver.userId)
    .filter((userId): userId is string => userId !== null);
}

function unique(userIds: readonly string[]): readonly string[] {
  return [...new Set(userIds)];
}
