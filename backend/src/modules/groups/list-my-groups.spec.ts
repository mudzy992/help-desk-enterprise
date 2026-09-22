import { listMyGroups } from './list-my-groups';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const configuration = {
  groupInboxEnabled: true,
  autoAssignEnabled: true,
  autoAssignStrategy: 'ROUND_ROBIN' as const,
};

function createPrismaStub(
  groups: readonly Record<string, unknown>[],
) {
  return {
    group: {
      findMany: jest.fn(async ({ where }: { where?: unknown }) =>
        where === undefined
          ? groups
          : groups.filter((group) => group.__member === true),
      ),
    },
  };
}

const contexts: Record<string, unknown> = {
  agent: { subjectId: 'u-agent', isSuperAdmin: false },
  super: { subjectId: 'u-super', isSuperAdmin: true },
};

function createLoader(name: string) {
  return { loadBySubjectId: async () => contexts[name] ?? null };
}

const configLoader = { load: async () => configuration };

describe('listMyGroups', () => {
  it('lists only groups the caller is a member of, ordered by unit path then name', async () => {
    const prisma = createPrismaStub([
      {
        id: 'g-hr', name: 'HR', isFallback: false, autoAssignStrategy: 'NONE',
        organizationalUnit: { id: 'ou-hr', name: 'HR', ouPath: '/HR' },
        _count: { members: 3 }, __member: true,
      },
    ]);
    const groups = await listMyGroups(
      prisma as never,
      createLoader('agent') as never,
      configLoader as never,
      'u-agent',
    );
    expect(groups).toEqual([
      {
        id: 'g-hr',
        name: 'HR',
        organizationalUnit: { id: 'ou-hr', name: 'HR', path: '/HR' },
        memberCount: 3,
        effectiveAutoAssign: 'ROUND_ROBIN',
        isFallback: false,
      },
    ]);
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { members: { some: { userId: 'u-agent' } } },
      }),
    );
  });

  it('gives SuperAdmin every group, with no membership filter', async () => {
    const prisma = createPrismaStub([
      { id: 'g-1', name: 'A', isFallback: false, autoAssignStrategy: 'NONE', organizationalUnit: { id: 'ou-1', name: 'A', ouPath: '/A' }, _count: { members: 1 } },
    ]);
    await listMyGroups(prisma as never, createLoader('super') as never, configLoader as never, 'u-super');
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it("reports each group's effective strategy: its own overrides the global one", async () => {
    const prisma = createPrismaStub([
      { id: 'g-own', name: 'Own', isFallback: false, autoAssignStrategy: 'LEAST_BUSY', organizationalUnit: { id: 'ou-1', name: 'A', ouPath: '/A' }, _count: { members: 1 }, __member: true },
      { id: 'g-global', name: 'Global', isFallback: false, autoAssignStrategy: 'NONE', organizationalUnit: { id: 'ou-1', name: 'A', ouPath: '/A' }, _count: { members: 1 }, __member: true },
    ]);
    const groups = await listMyGroups(prisma as never, createLoader('agent') as never, configLoader as never, 'u-agent');
    expect(groups.map((g) => g.effectiveAutoAssign)).toEqual(['LEAST_BUSY', 'ROUND_ROBIN']);
  });

  it('turns off every group\'s effective strategy when auto-assign is disabled globally', async () => {
    const prisma = createPrismaStub([
      { id: 'g-own', name: 'Own', isFallback: false, autoAssignStrategy: 'LEAST_BUSY', organizationalUnit: { id: 'ou-1', name: 'A', ouPath: '/A' }, _count: { members: 1 }, __member: true },
    ]);
    const disabled = { ...configuration, autoAssignEnabled: false };
    const groups = await listMyGroups(
      prisma as never,
      createLoader('agent') as never,
      { load: async () => disabled } as never,
      'u-agent',
    );
    expect(groups[0]?.effectiveAutoAssign).toBe('NONE');
  });

  it('refuses a caller without an authorization context', async () => {
    await expect(
      listMyGroups(
        createPrismaStub([]) as never,
        createLoader('nobody') as never,
        configLoader as never,
        'u-nobody',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
