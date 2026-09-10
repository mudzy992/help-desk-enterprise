import { ManualOnlyDirectorySyncProvider } from './manual-only-directory-sync.provider';
import { manualOnlyDirectoryCatalog } from './manual-only-directory-catalog';

describe('ManualOnlyDirectorySyncProvider', () => {
  const provider = new ManualOnlyDirectorySyncProvider();

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
      manualOnlyDirectoryCatalog.users.find(
        (user) => user.externalId === 'manual_only:user:dev-reader',
      ),
    ]);
    expect(result.groups).toEqual([]);
    expect(result.organizationalUnits).toEqual([]);
    expect(result.users[0]).toEqual(
      expect.objectContaining({
        externalId: 'manual_only:user:dev-reader',
        login: 'dev.reader',
        email: 'dev.reader@example.com',
        displayName: 'Dev Reader',
        distinguishedName: 'CN=Dev Reader,OU=Users,DC=example,DC=com',
        organizationalUnitPath: '/Users',
      }),
    );
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

  it('does not call the network while reading the in-memory catalog', async () => {
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
