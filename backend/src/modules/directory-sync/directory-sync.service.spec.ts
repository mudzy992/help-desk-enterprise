import { HttpException } from '@nestjs/common';
import { DirectoryReadCache } from './directory-read.cache';
import { DirectoryReadThrottle } from './directory-read.throttle';
import { DirectorySyncService } from './directory-sync.service';
import type {
  DirectorySyncConfiguration,
  DirectorySyncProvider,
} from './directory-sync.types';
import { ManualOnlyDirectorySyncProvider } from './manual-only-directory-sync.provider';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const usersScope = {
  distinguishedName: 'OU=Users,DC=example,DC=com',
  includeSubtree: true,
};

const groupsScope = {
  distinguishedName: 'OU=Groups,DC=example,DC=com',
  includeSubtree: true,
};

function createConfiguration(
  overrides: Partial<DirectorySyncConfiguration> = {},
): DirectorySyncConfiguration {
  return {
    enabled: true,
    strategy: 'manual_only',
    usersBaseDistinguishedName: 'OU=Users,DC=example,DC=com',
    groupsBaseDistinguishedName: 'OU=Groups,DC=example,DC=com',
    maxQueriesPerSecond: 0.5,
    cacheTimeToLiveMilliseconds: 1_000,
    organizationalUnitCacheTimeToLiveMilliseconds: 3_600_000,
    ...overrides,
  };
}

function createService(input: {
  readonly configuration?: DirectorySyncConfiguration;
  readonly provider?: DirectorySyncProvider;
  readonly clock?: { nowMilliseconds: number };
}): {
  readonly service: DirectorySyncService;
  readonly provider: DirectorySyncProvider;
  readonly clock: { nowMilliseconds: number };
} {
  const clock = input.clock ?? { nowMilliseconds: 0 };
  const provider = input.provider ?? new ManualOnlyDirectorySyncProvider();
  const service = new DirectorySyncService(
    { load: async () => input.configuration ?? createConfiguration() } as never,
    { resolve: () => provider } as never,
    new DirectoryReadCache(),
    new DirectoryReadThrottle(),
    () => clock.nowMilliseconds,
  );
  return { service, provider, clock };
}

async function expectErrorCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toBeInstanceOf(HttpException);
  await operation.catch((error: unknown) => {
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  });
}

describe('DirectorySyncService', () => {
  it('returns a normalized manual_only result for an explicit scoped read', async () => {
    const { service } = createService({});
    const result = await service.read({
      operation: 'users',
      scope: usersScope,
    });
    expect(result.strategy).toBe('manual_only');
    expect(result.operation).toBe('users');
    expect(result.users.length).toBeGreaterThan(0);
    expect(result.users[0]).not.toHaveProperty('provider');
    expect(JSON.stringify(result)).not.toContain('access_token');
  });

  it('serves a cache hit without a second provider read', async () => {
    const provider = new ManualOnlyDirectorySyncProvider();
    const read = jest.spyOn(provider, 'read');
    const { service } = createService({ provider });
    await service.read({ operation: 'users', scope: usersScope });
    await service.read({ operation: 'users', scope: usersScope });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('expires cached results after the configured TTL', async () => {
    const provider = new ManualOnlyDirectorySyncProvider();
    const read = jest.spyOn(provider, 'read');
    const clock = { nowMilliseconds: 0 };
    const { service } = createService({
      provider,
      clock,
      configuration: createConfiguration({ maxQueriesPerSecond: 1_000 }),
    });
    await service.read({ operation: 'users', scope: usersScope });
    clock.nowMilliseconds = 1_000;
    await service.read({ operation: 'users', scope: usersScope });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not leak cached results across scopes', async () => {
    const clock = { nowMilliseconds: 0 };
    const { service } = createService({ clock });
    const users = await service.read({
      operation: 'users',
      scope: usersScope,
    });
    clock.nowMilliseconds = 2_000;
    const groups = await service.read({
      operation: 'groups',
      scope: groupsScope,
    });
    expect(users.users.length).toBeGreaterThan(0);
    expect(groups.groups.length).toBeGreaterThan(0);
    expect(users.groups).toEqual([]);
    expect(groups.users).toEqual([]);
  });

  it('throttles a second cache-miss read inside the minimum interval', async () => {
    const { service } = createService({
      configuration: createConfiguration({ cacheTimeToLiveMilliseconds: 0 }),
    });
    await service.read({ operation: 'users', scope: usersScope });
    await expectErrorCode(
      service.read({
        operation: 'users',
        scope: { ...usersScope, includeSubtree: false },
      }),
      'DIRECTORY_READ_THROTTLED',
    );
  });

  it('rejects missing or unrestricted scope before contacting a provider', async () => {
    const provider = new ManualOnlyDirectorySyncProvider();
    const read = jest.spyOn(provider, 'read');
    const { service } = createService({ provider });
    await expectErrorCode(
      service.read({ operation: 'users', scope: undefined }),
      'INVALID_SCOPE',
    );
    await expectErrorCode(
      service.read({
        operation: 'users',
        scope: { distinguishedName: 'DC=example,DC=com', includeSubtree: true },
      }),
      'INVALID_SCOPE',
    );
    expect(read).not.toHaveBeenCalled();
  });

  it('fails closed when directory read is disabled', async () => {
    const { service } = createService({
      configuration: createConfiguration({ enabled: false }),
    });
    await expectErrorCode(
      service.read({ operation: 'users', scope: usersScope }),
      'DIRECTORY_READ_DISABLED',
    );
  });

  it('stays independent from local and entra_ad authentication modes', async () => {
    const entraLinked = createService({
      configuration: createConfiguration({ strategy: 'manual_only' }),
    });
    const localLinked = createService({
      configuration: createConfiguration({ strategy: 'manual_only' }),
    });
    const entraResult = await entraLinked.service.read({
      operation: 'users',
      scope: usersScope,
    });
    const localResult = await localLinked.service.read({
      operation: 'users',
      scope: usersScope,
    });
    expect(entraResult).toEqual(localResult);
    expect(JSON.stringify(entraResult)).not.toContain('entra_ad');
    expect(JSON.stringify(localResult)).not.toContain('"local"');
  });
});
