import { HttpException } from '@nestjs/common';
import { defaultManualDirectoryCatalog } from './default-manual-directory-catalog';
import { DirectoryReadCache } from './directory-read.cache';
import { DirectoryReadThrottle } from './directory-read.throttle';
import { DirectorySyncService } from './directory-sync.service';
import { DirectorySyncStatusStore } from './directory-sync-status.store';
import type {
  DirectoryReadRequest,
  DirectoryReadResult,
  DirectorySyncConfiguration,
  DirectorySyncProvider,
} from './directory-sync.types';

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

function createStubProvider(
  overrides: Partial<DirectoryReadResult> = {},
): DirectorySyncProvider {
  return {
    strategy: 'manual_only',
    read: async (request: DirectoryReadRequest): Promise<DirectoryReadResult> => ({
      strategy: 'manual_only',
      operation: request.operation,
      scope: request.scope,
      users:
        request.operation === 'users' ? [...defaultManualDirectoryCatalog.users] : [],
      groups:
        request.operation === 'groups'
          ? [...defaultManualDirectoryCatalog.groups]
          : [],
      organizationalUnits:
        request.operation === 'organizational_units'
          ? defaultManualDirectoryCatalog.organizationalUnits.map(
              ({ parentExternalId: _parent, ...unit }) => unit,
            )
          : [],
      ...overrides,
    }),
  };
}

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
  const provider = input.provider ?? createStubProvider();
  const prisma = {
    organizationalUnit: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
    user: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
    group: {
      findUnique: async () => null,
      create: async () => ({}),
      update: async () => ({}),
    },
  };
  const service = new DirectorySyncService(
    { load: async () => input.configuration ?? createConfiguration() } as never,
    { resolve: () => provider } as never,
    new DirectoryReadCache(),
    new DirectoryReadThrottle(),
    prisma as never,
    new DirectorySyncStatusStore(),
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
  });

  it('serves a cache hit without a second provider read', async () => {
    const provider = createStubProvider();
    const read = jest.spyOn(provider, 'read');
    const { service } = createService({ provider });
    await service.read({ operation: 'users', scope: usersScope });
    await service.read({ operation: 'users', scope: usersScope });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh bypasses cache and rematerializes', async () => {
    const provider = createStubProvider();
    const read = jest.spyOn(provider, 'read');
    const clock = { nowMilliseconds: 0 };
    const { service } = createService({
      provider,
      clock,
      configuration: createConfiguration({ maxQueriesPerSecond: 1_000 }),
    });
    await service.read({ operation: 'users', scope: usersScope });
    clock.nowMilliseconds = 10;
    await service.read({
      operation: 'users',
      scope: usersScope,
      forceRefresh: true,
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('expires cached results after the configured TTL', async () => {
    const provider = createStubProvider();
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
    const provider = createStubProvider();
    const read = jest.spyOn(provider, 'read');
    const { service } = createService({ provider });
    await expectErrorCode(
      service.read({ operation: 'users', scope: undefined }),
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
});
