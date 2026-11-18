import { scanProblemOwnerDrift, problemOwnerDriftScanLimit } from './problem-owner-drift';

type OwnerRow = {
  readonly id: string;
  readonly isActive: boolean;
  readonly anonymizedAt: Date | null;
  readonly homePath: string | null;
  readonly role: 'PROBLEM_MANAGER' | 'AGENT' | null;
  readonly permission: string;
  readonly assignmentPath: string | null;
  readonly groups: readonly string[];
};

const date = new Date('2026-11-17T09:00:00Z');

function owner(overrides: Partial<OwnerRow> & Pick<OwnerRow, 'id'>): OwnerRow {
  return {
    isActive: true,
    anonymizedAt: null,
    homePath: '/root/ou1',
    role: 'PROBLEM_MANAGER',
    permission: 'problem.manage',
    assignmentPath: '/root/ou1',
    groups: ['g1'],
    ...overrides,
  };
}

function prismaRow(input: {
  readonly ownerUserId: string | null;
  readonly groupId: string | null;
  readonly ouPath: string | null;
}) {
  return {
    ownerUserId: input.ownerUserId,
    groupId: input.groupId,
    organizationalUnit: input.ouPath === null ? null : { ouPath: input.ouPath },
  };
}

/** A user row in the shape `principalContextInclude` + the home unit returns. */
function userRow(input: OwnerRow) {
  return {
    id: input.id,
    email: `${input.id}@example.test`,
    displayName: input.id,
    isActive: input.isActive,
    isLocalOnly: false,
    mustChangePassword: false,
    entraObjectId: null,
    directoryObjectGuid: null,
    authzVersion: 1,
    organizationalUnitId: input.homePath,
    anonymizedAt: input.anonymizedAt,
    organizationalUnit: input.homePath === null ? null : { ouPath: input.homePath },
    userRoles:
      input.role === null
        ? []
        : [
            {
              id: `assignment-${input.id}`,
              role: {
                key: input.role,
                rolePermissions: [{ permission: { key: input.permission } }],
              },
              organizationalUnit:
                input.assignmentPath === null ? null : { id: input.assignmentPath, ouPath: input.assignmentPath },
              service: null,
            },
          ],
    groupMembers: input.groups.map((groupId) => ({ groupId })),
  };
}

function setup(input: {
  readonly problems: readonly ReturnType<typeof prismaRow>[];
  readonly owners: readonly OwnerRow[];
  readonly groupPaths?: Readonly<Record<string, string>>;
}) {
  const prisma = {
    problem: { findMany: jest.fn(async () => input.problems) },
    user: { findMany: jest.fn(async () => input.owners.map(userRow)) },
    group: {
      findMany: jest.fn(async () =>
        Object.entries(input.groupPaths ?? {}).map(([id, ouPath]) => ({
          id,
          organizationalUnit: { ouPath },
        })),
      ),
    },
  };
  return prisma;
}

/**
 * W7.33 / BA-problems-15: the scan that turns "a grant was revoked somewhere"
 * into a number an operator can see. It must read the recorded owner through the
 * same rule as the write path, and it must never look like a full sweep when the
 * page bound was reached.
 */
describe('scanProblemOwnerDrift', () => {
  it('reports no drift when every recorded owner still qualifies', async () => {
    const prisma = setup({
      problems: [prismaRow({ ownerUserId: 'u1', groupId: 'g1', ouPath: '/root/ou1' })],
      owners: [owner({ id: 'u1' })],
      groupPaths: { g1: '/root/ou1' },
    });

    await expect(scanProblemOwnerDrift(prisma as never)).resolves.toEqual({
      scannedProblems: 1,
      ineligibleOwners: 0,
      capped: false,
      reasons: { inactive: 0, not_manager: 0, not_member: 0, out_of_scope: 0 },
    });
  });

  it('counts the drift per reason the rule reports', async () => {
    const prisma = setup({
      problems: [
        prismaRow({ ownerUserId: 'gone', groupId: 'g1', ouPath: '/root/ou1' }),
        prismaRow({ ownerUserId: 'inactive', groupId: 'g1', ouPath: '/root/ou1' }),
        prismaRow({ ownerUserId: 'revoked', groupId: 'g1', ouPath: '/root/ou1' }),
        prismaRow({ ownerUserId: 'outsider', groupId: 'g1', ouPath: '/root/ou1' }),
        prismaRow({ ownerUserId: 'other-unit', groupId: 'g1', ouPath: '/root/ou1' }),
        prismaRow({ ownerUserId: 'fine', groupId: 'g1', ouPath: '/root/ou1' }),
      ],
      owners: [
        owner({ id: 'inactive', isActive: false }),
        owner({ id: 'revoked', permission: 'problem.read' }),
        owner({ id: 'outsider', groups: ['g2'] }),
        owner({ id: 'other-unit', assignmentPath: '/root/ou9' }),
        owner({ id: 'fine' }),
      ],
      groupPaths: { g1: '/root/ou1' },
    });

    const scan = await scanProblemOwnerDrift(prisma as never);
    expect(scan).toEqual({
      scannedProblems: 6,
      ineligibleOwners: 5,
      capped: false,
      reasons: { inactive: 2, not_manager: 1, not_member: 1, out_of_scope: 1 },
    });
  });

  it('binds the check to the problem unit, falling back to the group unit for a legacy row', async () => {
    // Legacy row without its own unit: the group's unit stands in.
    const legacy = setup({
      problems: [prismaRow({ ownerUserId: 'u1', groupId: 'g1', ouPath: null })],
      owners: [owner({ id: 'u1' })],
      groupPaths: { g1: '/root/ou1' },
    });
    await expect(scanProblemOwnerDrift(legacy as never)).resolves.toMatchObject({
      ineligibleOwners: 0,
    });

    // The problem's own unit wins: the group sits elsewhere, so a grant for the
    // group's unit must not cover this problem.
    const ownUnit = setup({
      problems: [prismaRow({ ownerUserId: 'u1', groupId: 'g1', ouPath: '/root/ou1' })],
      owners: [owner({ id: 'u1', assignmentPath: '/root/ou9' })],
      groupPaths: { g1: '/root/ou9' },
    });
    await expect(scanProblemOwnerDrift(ownUnit as never)).resolves.toMatchObject({
      ineligibleOwners: 1,
      reasons: expect.objectContaining({ out_of_scope: 1 }),
    });
  });

  it('says so when the page bound was reached', async () => {
    const problems = Array.from({ length: 3 }, () =>
      prismaRow({ ownerUserId: 'u1', groupId: 'g1', ouPath: '/root/ou1' }),
    );
    const prisma = setup({
      problems,
      owners: [owner({ id: 'u1', permission: 'problem.read' })],
      groupPaths: { g1: '/root/ou1' },
    });
    const scan = await scanProblemOwnerDrift(prisma as never, { limit: 3 });
    expect(scan.capped).toBe(true);
    expect(scan.ineligibleOwners).toBe(3);
    expect((prisma.problem.findMany as jest.Mock).mock.calls[0][0]).toMatchObject({ take: 3 });
  });

  it('reads only open owned problems, newest first, one page at a time', async () => {
    const prisma = setup({
      problems: [prismaRow({ ownerUserId: 'u1', groupId: 'g1', ouPath: '/root/ou1' })],
      owners: [owner({ id: 'u1' })],
      groupPaths: { g1: '/root/ou1' },
    });

    await scanProblemOwnerDrift(prisma as never);
    const args = (prisma.problem.findMany as jest.Mock).mock.calls[0][0] as {
      where: { ownerUserId: unknown; status: { in: string[] } };
      take: number;
      orderBy: unknown;
    };
    expect(args.where.ownerUserId).toEqual({ not: null });
    expect(args.where.status.in).toEqual(['NEW', 'INVESTIGATING', 'KNOWN_ERROR']);
    expect(args.take).toBe(problemOwnerDriftScanLimit);
    expect(args.orderBy).toEqual({ updatedAt: 'desc' });
    // One query per collection, never one per problem.
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.group.findMany).toHaveBeenCalledTimes(1);
  });

  it('does nothing else when no open problem has an owner', async () => {
    const prisma = setup({ problems: [], owners: [], groupPaths: {} });
    await expect(scanProblemOwnerDrift(prisma as never)).resolves.toMatchObject({
      scannedProblems: 0,
      ineligibleOwners: 0,
      capped: false,
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });

  it('treats an anonymised owner as inactive drift', async () => {
    const prisma = setup({
      problems: [prismaRow({ ownerUserId: 'u1', groupId: 'g1', ouPath: '/root/ou1' })],
      owners: [owner({ id: 'u1', anonymizedAt: date })],
      groupPaths: { g1: '/root/ou1' },
    });
    const scan = await scanProblemOwnerDrift(prisma as never);
    expect(scan.reasons.inactive).toBe(1);
  });
});
