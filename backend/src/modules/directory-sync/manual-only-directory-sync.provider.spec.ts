jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { defaultManualDirectoryCatalog } from './default-manual-directory-catalog';
import { ManualOnlyDirectorySyncProvider } from './manual-only-directory-sync.provider';

function createProvider(): ManualOnlyDirectorySyncProvider {
  const prisma = {
    manualDirectoryOrganizationalUnit: {
      findMany: async () =>
        defaultManualDirectoryCatalog.organizationalUnits.map((unit) => ({
          ...unit,
          distinguishedName: unit.distinguishedName ?? '',
          organizationalUnitPath: unit.organizationalUnitPath ?? '',
        })),
    },
    manualDirectoryUser: {
      findMany: async () => [...defaultManualDirectoryCatalog.users],
    },
    manualDirectoryGroup: {
      findMany: async () => [...defaultManualDirectoryCatalog.groups],
    },
  };
  return new ManualOnlyDirectorySyncProvider(prisma as never);
}

describe('ManualOnlyDirectorySyncProvider', () => {
  const provider = createProvider();

  it('identifies itself as manual_only and returns normalized user data', async () => {
    const result = await provider.read({
      operation: 'users',
      scope: {
        distinguishedName: 'OU=Users,DC=example,DC=com',
        organizationalUnitPath: null,
        includeSubtree: false,
      },
    });
    expect(provider.strategy).toBe('manual_only');
    expect(result.strategy).toBe('manual_only');
    expect(result.users).toEqual([
      defaultManualDirectoryCatalog.users.find(
        (user) => user.externalId === 'manual_only:user:dev-reader',
      ),
    ]);
    expect(result.groups).toEqual([]);
    expect(result.organizationalUnits).toEqual([]);
  });

  it('restricts subtree reads independently of exact-scope reads', async () => {
    const exact = await provider.read({
      operation: 'users',
      scope: {
        distinguishedName: 'OU=Users,DC=example,DC=com',
        organizationalUnitPath: null,
        includeSubtree: false,
      },
    });
    const subtree = await provider.read({
      operation: 'users',
      scope: {
        distinguishedName: 'OU=Users,DC=example,DC=com',
        organizationalUnitPath: null,
        includeSubtree: true,
      },
    });
    expect(exact.users.map((user) => user.externalId)).toEqual([
      'manual_only:user:dev-reader',
    ]);
    expect(subtree.users.map((user) => user.externalId)).toEqual([
      'manual_only:user:dev-reader',
      'manual_only:user:it-reader',
    ]);
  });

  it('does not call the network while reading the catalog', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => {
        throw new Error('network must not be used');
      });
    await provider.read({
      operation: 'groups',
      scope: {
        distinguishedName: 'OU=Groups,DC=example,DC=com',
        organizationalUnitPath: '/Groups',
        includeSubtree: true,
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
