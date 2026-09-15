import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SocketGroupMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async groupIdsForUser(userId: string): Promise<readonly string[]> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    return memberships.map((membership) => membership.groupId);
  }
}
