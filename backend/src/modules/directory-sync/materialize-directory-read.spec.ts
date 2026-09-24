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
    distinguishedName: 'CN=Agent One,OU=IT,DC=epbih,DC=ba',
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
            distinguishedName: 'CN=IT,OU=IT,DC=epbih,DC=ba',
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
