jest.mock('../../../common/cache/scope-catalog-cache', () => ({
  invalidateOrganizationalUnitScopeCache: jest.fn(),
}));

import { applyDirectorySyncPlan } from './apply-directory-sync-plan';
import type { DirectorySyncPlan } from './directory-sync-plan.types';

function emptyPlan(overrides: Partial<DirectorySyncPlan> = {}): DirectorySyncPlan {
  return {
    organizationalUnits: { create: [], update: [] },
    users: { create: [], update: [], reactivate: [], deactivate: [], unchanged: 0 },
    roles: { grant: [], revoke: [] },
    exceptions: [],
    unitCounts: [],
    safeguard: { activeManagedUsers: 0, deactivations: 0, percent: 0, limitPercent: 10, tripped: false },
    totals: { directoryUsers: 0, directoryUnits: 0 },
    ...overrides,
  };
}

function createPrisma() {
  return {
    organizationalUnit: {
      findUnique: jest.fn().mockResolvedValue({ id: 'ou-1' }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    },
    role: { upsert: jest.fn().mockResolvedValue({ id: 'role-user' }) },
    user: {
      create: jest.fn().mockResolvedValue({ id: 'new-user' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
    userRole: { create: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe('applyDirectorySyncPlan (paket 1.8)', () => {
  it('guards every user write against local accounts and revokes sessions of deactivated users', async () => {
    const prisma = createPrisma();
    const hooks = { invalidateUsers: jest.fn(), revokeSessions: jest.fn() };
    const result = await applyDirectorySyncPlan(
      prisma as never,
      emptyPlan({
        users: {
          create: [],
          update: [],
          reactivate: [],
          deactivate: [{ userId: 'u1', email: 'a@x', displayName: 'A', reason: 'missing' }],
          unchanged: 0,
        },
        roles: { grant: [], revoke: [{ userRoleId: 'ur-1', userId: 'u1', email: 'a@x', roleKey: 'SUPER_ADMIN' }] },
      }),
      hooks,
      new Date('2026-10-03T00:00:00Z'),
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', isLocalOnly: false, isActive: true },
      data: expect.objectContaining({ isActive: false }),
    });
    // The revoke filter pins ADMIN/AGENT: a SUPER_ADMIN row can never match.
    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { id: 'ur-1', role: { key: { in: ['ADMIN', 'AGENT'] } } },
    });
    expect(hooks.revokeSessions).toHaveBeenCalledWith(['u1']);
    expect(hooks.invalidateUsers).toHaveBeenCalledWith(['u1']);
    expect(result.usersDeactivated).toBe(1);
  });

  it('records a failing row and continues with the rest', async () => {
    const prisma = createPrisma();
    prisma.user.create
      .mockRejectedValueOnce(new Error('unique'))
      .mockResolvedValueOnce({ id: 'u-b' });
    const user = (email: string) => ({
      guid: email, email, displayName: email, distinguishedName: `CN=${email}`,
      company: null, department: null, ouPath: '/Korisnici',
    });
    const result = await applyDirectorySyncPlan(
      prisma as never,
      emptyPlan({ users: { create: [user('a@x'), user('b@x')], update: [], reactivate: [], deactivate: [], unchanged: 0 } }),
      { invalidateUsers: jest.fn(), revokeSessions: jest.fn() },
      new Date(),
    );
    expect(result.usersCreated).toBe(1);
    expect(result.failures).toEqual([{ step: 'user.create', email: 'a@x', path: '/Korisnici' }]);
  });
});
