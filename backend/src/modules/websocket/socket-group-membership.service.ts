import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SocketGroupMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async groupIdsForUser(userId: string): Promise<readonly string[]> {
    // Not cached on purpose: joined once per connection, and it must reflect the
    // membership as of the handshake.
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    return memberships.map((membership) => membership.groupId);
  }

  /** Package 1.7 (R1): ADMIN or SUPER_ADMIN (any scope) joins `role:admins`. */
  async isAdmin(userId: string): Promise<boolean> {
    const role = await this.prisma.userRole.findFirst({
      where: { userId, role: { key: { in: ['ADMIN', 'SUPER_ADMIN'] } } },
      select: { id: true },
    });
    return role !== null;
  }
}
