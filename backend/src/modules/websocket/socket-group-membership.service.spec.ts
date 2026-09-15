import { SocketGroupMembershipService } from './socket-group-membership.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SocketGroupMembershipService', () => {
  it('returns handler group ids for the connected user', async () => {
    const prisma = {
      groupMember: {
        findMany: jest.fn().mockResolvedValue([{ groupId: 'group-it' }]),
      },
    };
    const service = new SocketGroupMembershipService(prisma as never);
    await expect(service.groupIdsForUser('user-1')).resolves.toEqual([
      'group-it',
    ]);
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { groupId: true },
    });
  });
});
