import { DirectorySyncError } from './directory-sync.error';
import { parseDirectorySyncConfiguration } from './parse-directory-sync-configuration';

describe('parseDirectorySyncConfiguration', () => {
  const validInput = {
    enabled: true,
    strategy: 'manual_only',
    usersBaseDistinguishedName: 'OU=Users,DC=example,DC=com',
    groupsBaseDistinguishedName: 'OU=Groups,DC=example,DC=com',
    maxQueriesPerSecond: 0.5,
    cacheTimeToLiveMinutes: 30,
    organizationalUnitCacheTimeToLiveHours: 12,
  };

  it('parses the manual_only development configuration', () => {
    expect(parseDirectorySyncConfiguration(validInput)).toEqual({
      enabled: true,
      strategy: 'manual_only',
      usersBaseDistinguishedName: 'OU=Users,DC=example,DC=com',
      groupsBaseDistinguishedName: 'OU=Groups,DC=example,DC=com',
      maxQueriesPerSecond: 0.5,
      cacheTimeToLiveMilliseconds: 30 * 60_000,
      organizationalUnitCacheTimeToLiveMilliseconds: 12 * 3_600_000,
    });
  });

  it('accepts scheduled as a strategy value but leaves implementation to the resolver', () => {
    expect(
      parseDirectorySyncConfiguration({
        ...validInput,
        strategy: 'scheduled',
      }).strategy,
    ).toBe('scheduled');
  });

  it('fails closed for invalid strategy, non-boolean enabled, and non-positive throttle', () => {
    expect(() =>
      parseDirectorySyncConfiguration({ ...validInput, strategy: 'ldap' }),
    ).toThrow(new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE'));
    expect(() =>
      parseDirectorySyncConfiguration({ ...validInput, enabled: 'true' }),
    ).toThrow(new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE'));
    expect(() =>
      parseDirectorySyncConfiguration({
        ...validInput,
        maxQueriesPerSecond: 0,
      }),
    ).toThrow(new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE'));
  });
});
