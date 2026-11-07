import { SocketGroupMembershipService } from './socket-group-membership.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SocketGroupMembershipService', () => {
  it('returns groups, admin status and authz version from one joined snapshot', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          authzVersion: 9,
          isActive: true,
          groupMembers: [{ groupId: 'group-it' }, { groupId: 'group-ops' }],
          userRoles: [{ id: 'user-role-admin' }],
        }),
      },
    };
    const service = new SocketGroupMembershipService(prisma as never);

    await expect(service.roomAccessForUser('user-1')).resolves.toEqual({
      authzVersion: 9,
      isActive: true,
      groupIds: ['group-it', 'group-ops'],
      isAdmin: true,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
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
  });

  it('reports a deleted principal instead of granting any managed room', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new SocketGroupMembershipService(prisma as never);

    await expect(service.roomAccessForUser('missing-user')).resolves.toBeNull();
  });
});
