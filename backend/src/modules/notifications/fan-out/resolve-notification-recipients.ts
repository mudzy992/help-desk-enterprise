import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRecord } from '../../tickets/tickets.types';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';

/** Escalations keep their own targets (rule user/role/group); see below. */
const slaEscalationEvents = new Set<string>([
  ticketSystemEventActions.slaResponseEscalated,
  ticketSystemEventActions.slaResolutionEscalated,
]);
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

/**
 * Option A (F2.3, 2026-09-24): in-app audience = a few PERSONAL recipients plus at most
 * one GROUP audience. The group part becomes one `Notification` row and one emit into
 * the group room instead of one row + one emit per member (a 200-member group was 200
 * of each per event).
 *
 * Anyone who already gets a personal row (requester, assignee, watchers) and the actor
 * are written into `excludedUserIds`, so nobody sees the same event twice and nobody is
 * notified about their own action — without reading the member list at all.
 *
 * E-mail keeps using `resolveNotificationRecipients` (it needs addresses per person).
 */
export type NotificationAudience = {
  readonly userIds: readonly string[];
  readonly group: {
    readonly groupId: string;
    readonly excludedUserIds: readonly string[];
  } | null;
};

export async function resolveNotificationAudience(
  prisma: PrismaService,
  input: {
    readonly type: NotificationType;
    readonly ticket: TicketRecord;
    readonly actorUserId: string | null;
    readonly event?: string;
    readonly messageBody?: string;
  },
): Promise<NotificationAudience> {
  const groupId = input.ticket.assignedGroupId;
  const withoutActor = (ids: readonly (string | null)[]) =>
    unique(
      ids.filter(
        (id): id is string =>
          id !== null && id.length > 0 && id !== input.actorUserId,
      ),
    );
  if (input.type === notificationTypes.ticketCreated && groupId !== null) {
    return {
      userIds: [],
      group: {
        groupId,
        excludedUserIds: unique(
          [input.actorUserId, input.ticket.assignedUserId].filter(
            (id): id is string => id !== null && id.length > 0,
          ),
        ),
      },
    };
  }
  if (input.type === notificationTypes.ticketMessage && groupId !== null) {
    const personal = withoutActor([
      input.ticket.requesterId,
      input.ticket.assignedUserId,
      ...(await participantUserIds(prisma, input.ticket.id, 'WATCHER')),
    ]);
    return {
      userIds: personal,
      group: {
        groupId,
        excludedUserIds: unique(
          [...personal, input.actorUserId].filter(
            (id): id is string => id !== null && id.length > 0,
          ),
        ),
      },
    };
  }
  // Staging 2026-09-25: SLA at-risk/breach went out as one PERSONAL row per group
  // member (170k rows for 7.6k breached tickets, ~22 per ticket). Same Option A
  // shape as a new ticket: the assignee personally, the rest of the group as ONE
  // group row. Escalations still resolve their rule's explicit targets.
  if (
    input.type === notificationTypes.ticketSla &&
    groupId !== null &&
    (input.event === undefined || !slaEscalationEvents.has(input.event))
  ) {
    const personal = withoutActor([input.ticket.assignedUserId]);
    return {
      userIds: personal,
      group: {
        groupId,
        excludedUserIds: unique(
          [...personal, input.actorUserId].filter(
            (id): id is string => id !== null && id.length > 0,
          ),
        ),
      },
    };
  }
  // Package 1.1: a forward notifies the new handlers — the chosen agent, or
  // else the target group as ONE group row — plus, personally, the previous
  // assignee and (by setting, recorded on the event) the requester.
  if (input.type === notificationTypes.ticketForwarded) {
    const extra = await forwardEventRecipients(prisma, input.messageBody);
    const personal = withoutActor([input.ticket.assignedUserId, ...extra]);
    return {
      userIds: personal,
      group:
        input.ticket.assignedUserId === null && groupId !== null
          ? {
              groupId,
              excludedUserIds: unique(
                [...personal, input.actorUserId].filter(
                  (id): id is string => id !== null && id.length > 0,
                ),
              ),
            }
          : null,
    };
  }
  return {
    userIds: await resolveNotificationRecipients(prisma, input),
    group: null,
  };
}

/** `ticket_forwarded:<forwardEventId>` → previous assignee and requester (if notified). */
async function forwardEventRecipients(
  prisma: PrismaService,
  messageBody: string | undefined,
): Promise<readonly string[]> {
  const eventId = messageBody?.split(':')[1] ?? '';
  if (eventId.length === 0) {
    return [];
  }
  const event = await prisma.ticketForwardEvent.findUnique({
    where: { id: eventId },
    select: {
      previousAssigneeId: true,
      requesterNotified: true,
      ticket: { select: { requesterId: true } },
    },
  });
  if (event === null) {
    return [];
  }
  return [
    event.previousAssigneeId,
    event.requesterNotified ? event.ticket.requesterId : null,
  ].filter((id): id is string => id !== null);
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
    case notificationTypes.ticketForwarded:
      return [
        ...(input.ticket.assignedUserId === null
          ? await groupMemberUserIds(prisma, input.ticket.assignedGroupId)
          : [input.ticket.assignedUserId]),
        ...(await forwardEventRecipients(prisma, input.messageBody)),
      ];
    case notificationTypes.ticketTimeAutoStopped: {
      const ownerUserId = input.messageBody?.split(':')[2] ?? '';
      return ownerUserId.length === 0 ? [] : [ownerUserId];
    }
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
