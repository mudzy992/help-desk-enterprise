import { SocketGroupMembershipService } from './socket-group-membership.service';
import { socketRoomRevalidationBatchSize } from './socket-room-revalidation';

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
          where: {
            role: { key: { in: ['ADMIN', 'SUPER_ADMIN'] } },
            organizationalUnitId: null,
            serviceId: null,
          },
          select: { id: true },
          take: 1,
        },
      },
      relationLoadStrategy: 'join',
    });
  });

  it('BA-websocket-13: a scoped admin assignment does not grant the global admin room', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          authzVersion: 3,
          isActive: true,
          groupMembers: [],
          // The scoped assignment exists in the table, but the query only
          // returns unscoped assignments, so the snapshot must deny the room.
          userRoles: [],
        }),
      },
    };
    const service = new SocketGroupMembershipService(prisma as never);

    await expect(service.roomAccessForUser('scoped-admin')).resolves.toEqual({
      authzVersion: 3,
      isActive: true,
      groupIds: [],
      isAdmin: false,
    });
  });

  it('reports a deleted principal instead of granting any managed room', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new SocketGroupMembershipService(prisma as never);

    await expect(service.roomAccessForUser('missing-user')).resolves.toBeNull();
  });

  it('loads distinct users in one bounded query and marks omitted users missing', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            authzVersion: 4,
            isActive: true,
            groupMembers: [{ groupId: 'group-a' }],
            userRoles: [{ id: 'role-admin' }],
          },
        ]),
      },
    };
    const service = new SocketGroupMembershipService(prisma as never);

    await expect(
      service.roomAccessForUsers(['user-1', 'user-2', 'user-1']),
    ).resolves.toEqual(
      new Map([
        [
          'user-1',
          {
            authzVersion: 4,
            isActive: true,
            groupIds: ['group-a'],
            isAdmin: true,
          },
        ],
        ['user-2', null],
      ]),
    );
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1', 'user-2'] } },
      select: {
        id: true,
        authzVersion: true,
        isActive: true,
        groupMembers: { select: { groupId: true } },
        userRoles: {
          where: {
            role: { key: { in: ['ADMIN', 'SUPER_ADMIN'] } },
            organizationalUnitId: null,
            serviceId: null,
          },
          select: { id: true },
          take: 1,
        },
      },
      relationLoadStrategy: 'join',
    });
  });

  it('rejects oversized batches before issuing a database query', async () => {
    const prisma = { user: { findMany: jest.fn() } };
    const service = new SocketGroupMembershipService(prisma as never);

    await expect(
      service.roomAccessForUsers(
        Array.from({ length: socketRoomRevalidationBatchSize + 1 }, (_, i) =>
          `user-${i}`,
        ),
      ),
    ).rejects.toThrow(
      `socket room membership batch exceeds ${socketRoomRevalidationBatchSize} users`,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
