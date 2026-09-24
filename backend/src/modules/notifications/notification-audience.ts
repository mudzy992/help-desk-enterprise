import type { Prisma } from '../../generated/prisma/client';
import {
  loadActorGroupMemberships,
  type ActorGroupMembership,
} from '../../common/cache/scope-catalog-cache';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Option A (F2.3, 2026-09-24): who sees which notification.
 *
 * A notification is either
 *   - PERSONAL: `userId = me` — read state is the row's own `isRead`, or
 *   - GROUP: `groupId ∈ my groups`, created at/after I joined that group, and I am not
 *     in `excludedUserIds` — read state is a `NotificationReceipt (notificationId, me)`.
 *
 * The join-time rule matters: without it a new agent would inherit the whole retained
 * history of the group as unread. The memberships come from the per-process catalogue
 * cache (`scope-catalog-cache.ts`, 30 s), so the audience costs no extra query on a
 * warm path.
 *
 * With no group memberships every `where` below collapses to the pre-Option-A shape
 * (`{ userId }`), so personal-only users run exactly the queries they ran before.
 */
export async function loadNotificationAudience(
  prisma: PrismaService,
  userId: string,
): Promise<readonly ActorGroupMembership[]> {
  if (typeof (prisma as { groupMember?: { findMany?: unknown } }).groupMember?.findMany !== 'function') {
    return [];
  }
  return loadActorGroupMemberships(prisma, userId);
}

function groupConditions(
  userId: string,
  memberships: readonly ActorGroupMembership[],
): Prisma.NotificationWhereInput[] {
  return memberships.map((membership) => ({
    groupId: membership.groupId,
    createdAt: { gte: membership.joinedAt },
    NOT: { excludedUserIds: { has: userId } },
  }));
}

/** Every notification the user can see (personal + group). */
export function visibleNotificationWhere(
  userId: string,
  memberships: readonly ActorGroupMembership[],
  extra: { readonly unreadOnly?: boolean } = {},
): Prisma.NotificationWhereInput {
  const personal: Prisma.NotificationWhereInput =
    extra.unreadOnly === true ? { userId, isRead: false } : { userId };
  if (memberships.length === 0) {
    return personal;
  }
  const groups = groupConditions(userId, memberships).map((condition) =>
    extra.unreadOnly === true
      ? { ...condition, receipts: { none: { userId } } }
      : condition,
  );
  return { OR: [personal, ...groups] };
}

/** Only the unread group notifications of the user (for "mark all read"). */
export function unreadGroupNotificationWhere(
  userId: string,
  memberships: readonly ActorGroupMembership[],
): Prisma.NotificationWhereInput | null {
  if (memberships.length === 0) {
    return null;
  }
  return {
    OR: groupConditions(userId, memberships).map((condition) => ({
      ...condition,
      receipts: { none: { userId } },
    })),
  };
}

/** Whether a stored row is visible to the user (used when marking one as read). */
export function isNotificationVisibleTo(
  record: {
    readonly userId: string | null;
    readonly groupId?: string | null;
    readonly excludedUserIds?: readonly string[];
    readonly createdAt: Date;
  },
  userId: string,
  memberships: readonly ActorGroupMembership[],
): boolean {
  if (record.userId !== null) {
    return record.userId === userId;
  }
  if (record.groupId === null || record.groupId === undefined) {
    return false;
  }
  if ((record.excludedUserIds ?? []).includes(userId)) {
    return false;
  }
  return memberships.some(
    (membership) =>
      membership.groupId === record.groupId &&
      record.createdAt.getTime() >= membership.joinedAt.getTime(),
  );
}
