import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  socketRoomRevalidationBatchSize,
  type SocketRoomAuthorizationSnapshot,
} from './socket-room-revalidation';

@Injectable()
export class SocketGroupMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns group rooms, admin-room access and the authz version from one
   * authoritative user snapshot. The version ties the room grant to the same
   * lease used by socket-session revalidation and cross-instance invalidation.
   */
  async roomAccessForUser(
    userId: string,
  ): Promise<SocketRoomAuthorizationSnapshot | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        authzVersion: true,
        isActive: true,
        groupMembers: { select: { groupId: true } },
        userRoles: {
          where: { role: { key: { in: ['ADMIN', 'SUPER_ADMIN'] } } },
          select: { id: true },
          take: 1,
        },
      },
      relationLoadStrategy: 'join',
    });
    if (user === null) return null;
    return {
      authzVersion: user.authzVersion,
      isActive: user.isActive,
      groupIds: user.groupMembers.map(({ groupId }) => groupId),
      isAdmin: user.userRoles.length > 0,
    };
  }

  /** Loads one authorization rowset for a bounded set of connected subjects. */
  async roomAccessForUsers(
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, SocketRoomAuthorizationSnapshot | null>> {
    const uniqueUserIds = [...new Set(userIds)];
    const snapshots = new Map<string, SocketRoomAuthorizationSnapshot | null>();
    if (uniqueUserIds.length === 0) return snapshots;
    if (uniqueUserIds.length > socketRoomRevalidationBatchSize) {
      throw new RangeError(
        `socket room membership batch exceeds ${socketRoomRevalidationBatchSize} users`,
      );
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: {
        id: true,
        authzVersion: true,
        isActive: true,
        groupMembers: { select: { groupId: true } },
        userRoles: {
          where: { role: { key: { in: ['ADMIN', 'SUPER_ADMIN'] } } },
          select: { id: true },
          take: 1,
        },
      },
      relationLoadStrategy: 'join',
    });

    for (const user of users) {
      snapshots.set(user.id, {
        authzVersion: user.authzVersion,
        isActive: user.isActive,
        groupIds: user.groupMembers.map(({ groupId }) => groupId),
        isAdmin: user.userRoles.length > 0,
      });
    }
    for (const userId of uniqueUserIds) {
      if (!snapshots.has(userId)) snapshots.set(userId, null);
    }
    return snapshots;
  }
}
