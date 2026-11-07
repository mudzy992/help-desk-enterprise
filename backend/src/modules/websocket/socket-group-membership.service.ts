import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SocketRoomAuthorizationSnapshot } from './socket-room-revalidation';

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
}
