import { materializeDirectoryRead } from './materialize-directory-read';
import type {
  DirectoryReadResult,
  DirectoryUser,
} from './directory-sync.types';

function directoryUser(overrides: Partial<DirectoryUser> = {}): DirectoryUser {
  return {
    externalId: 'entra-1',
    login: 'agent@example.com',
    email: 'agent@example.com',
    displayName: 'Agent One',
    distinguishedName: 'CN=Agent One,OU=IT,DC=example,DC=com',
    organizationalUnitPath: null,
    ...overrides,
  };
}

function readResult(users: readonly DirectoryUser[]): DirectoryReadResult {
  return {
    strategy: 'scheduled',
    operation: 'users',
    scope: {
      distinguishedName: null,
      organizationalUnitPath: null,
      includeSubtree: true,
    },
    users,
    groups: [],
    organizationalUnits: [],
  };
}

function organizationalUnitReadResult(
  organizationalUnits: DirectoryReadResult['organizationalUnits'],
): DirectoryReadResult {
  return {
    strategy: 'scheduled',
    operation: 'organizational_units',
    scope: {
      distinguishedName: null,
      organizationalUnitPath: null,
      includeSubtree: true,
    },
    users: [],
    groups: [],
    organizationalUnits,
  };
}

/**
 * Phase 2.2 (plan §2.2): a directory read updates display names and unit
 * membership of known users, so exactly those users lose their cached
 * authorization data — and only them.
 */
describe('materializeDirectoryRead invalidation', () => {
  function createPrisma(existing: ReadonlyMap<string, { id: string; isLocalOnly: boolean }>) {
    const upsert = jest.fn().mockImplementation(
      async (args: { where: { email: string } }) => ({
        id: existing.get(args.where.email)?.id ?? `new-${args.where.email}`,
      }),
    );
    return {
      prisma: {
        organizationalUnit: { findUnique: jest.fn().mockResolvedValue(null) },
        user: {
          findUnique: jest.fn().mockImplementation(
            async (args: { where: { email: string } }) =>
              existing.get(args.where.email) ?? null,
          ),
          upsert,
        },
      },
      upsert,
    };
  }

  it('invalidates the users that were updated', async () => {
    const { prisma } = createPrisma(
      new Map([['agent@example.com', { id: 'user-agent', isLocalOnly: false }]]),
    );
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);

    await materializeDirectoryRead(prisma as never, readResult([directoryUser()]), invalidateUsers);

    expect(invalidateUsers).toHaveBeenCalledTimes(1);
    expect(invalidateUsers).toHaveBeenCalledWith(['user-agent']);
  });

  it('invalidates earlier user updates if a later materialization row fails', async () => {
    const { prisma } = createPrisma(
      new Map([
        ['first@example.com', { id: 'user-first', isLocalOnly: false }],
        ['second@example.com', { id: 'user-second', isLocalOnly: false }],
      ]),
    );
    prisma.user.findUnique.mockImplementation(async (args: {
      where: { email: string };
    }) => {
      if (args.where.email === 'second@example.com') {
        throw new Error('directory read failed');
      }
      return { id: 'user-first', isLocalOnly: false };
    });
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);

    await expect(
      materializeDirectoryRead(
        prisma as never,
        readResult([
          directoryUser({ email: 'first@example.com' }),
          directoryUser({ email: 'second@example.com' }),
        ]),
        invalidateUsers,
      ),
    ).rejects.toThrow('directory read failed');

    expect(invalidateUsers).toHaveBeenCalledWith(['user-first']);
  });

  it('invalidates an existing user when an upsert reports a post-commit error', async () => {
    const { prisma, upsert } = createPrisma(
      new Map([['agent@example.com', { id: 'user-agent', isLocalOnly: false }]]),
    );
    let committed = false;
    upsert.mockImplementationOnce(async () => {
      committed = true;
      throw new Error('connection lost after commit');
    });
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);

    await expect(
      materializeDirectoryRead(prisma as never, readResult([directoryUser()]), invalidateUsers),
    ).rejects.toThrow('connection lost after commit');

    expect(committed).toBe(true);
    expect(invalidateUsers).toHaveBeenCalledWith(['user-agent']);
  });

  it('does not invalidate a user that was just created', async () => {
    const { prisma } = createPrisma(new Map());
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);

    await materializeDirectoryRead(prisma as never, readResult([directoryUser()]), invalidateUsers);

    // Nothing was cached for a brand new user.
    expect(invalidateUsers).not.toHaveBeenCalled();
  });

  it('leaves local-only users untouched', async () => {
    const { prisma, upsert } = createPrisma(
      new Map([['agent@example.com', { id: 'user-agent', isLocalOnly: true }]]),
    );
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);

    await materializeDirectoryRead(prisma as never, readResult([directoryUser()]), invalidateUsers);

    expect(upsert).not.toHaveBeenCalled();
    expect(invalidateUsers).not.toHaveBeenCalled();
  });

  it('reports each affected user once', async () => {
    const { prisma } = createPrisma(
      new Map([['agent@example.com', { id: 'user-agent', isLocalOnly: false }]]),
    );
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);

    await materializeDirectoryRead(
      prisma as never,
      readResult([
        directoryUser(),
        directoryUser({ externalId: 'entra-1-again', displayName: 'Agent One (moved)' }),
      ]),
      invalidateUsers,
    );

    expect(invalidateUsers).toHaveBeenCalledWith(['user-agent']);
  });

  it('invalidates holders of role assignments when directory materialization changes an OU path', async () => {
    const parentLookups: string[] = [];
    const userRoleFindMany = jest
      .fn()
      .mockResolvedValue([{ userId: 'user-a' }, { userId: 'user-b' }, { userId: 'user-a' }]);
    const prisma = {
      organizationalUnit: {
        findUnique: jest.fn().mockImplementation(async (args: {
          where: { distinguishedName?: string; ouPath?: string };
        }) => {
          if (args.where.distinguishedName !== undefined) {
            return { id: 'ou-it', ouPath: '/Old/IT' };
          }
          parentLookups.push(args.where.ouPath ?? '');
          return { id: 'ou-new-parent' };
        }),
        upsert: jest.fn().mockResolvedValue({ id: 'ou-it' }),
      },
      userRole: { findMany: userRoleFindMany },
    };
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);

    await materializeDirectoryRead(
      prisma as never,
      organizationalUnitReadResult([
        {
          externalId: 'ou-1',
          displayName: 'IT',
          distinguishedName: 'OU=IT,OU=New,DC=example,DC=com',
          organizationalUnitPath: '/New/IT',
          type: 'BRANCH',
        },
      ]),
      invalidateUsers,
    );

    expect(parentLookups).toEqual(['/New']);
    expect(userRoleFindMany).toHaveBeenCalledWith({
      where: { organizationalUnitId: { in: ['ou-it'] } },
      select: { userId: true },
      distinct: ['userId'],
    });
    expect(invalidateUsers).toHaveBeenCalledTimes(1);
    expect(invalidateUsers).toHaveBeenCalledWith(['user-a', 'user-b']);
  });

  it('ignores entries without an email and other operations', async () => {
    const { prisma, upsert } = createPrisma(new Map());
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);

    await materializeDirectoryRead(
      prisma as never,
      readResult([directoryUser({ email: null })]),
      invalidateUsers,
    );
    await materializeDirectoryRead(
      prisma as never,
      {
        ...readResult([]),
        operation: 'groups',
        groups: [
          {
            externalId: 'group-1',
            displayName: 'IT Support',
            distinguishedName: 'CN=IT,OU=IT,DC=example,DC=com',
            organizationalUnitPath: '/Korisnici/IT',
          },
        ],
      },
      invalidateUsers,
    );

    expect(upsert).not.toHaveBeenCalled();
    expect(invalidateUsers).not.toHaveBeenCalled();
  });
});
