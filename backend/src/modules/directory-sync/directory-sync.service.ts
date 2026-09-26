import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { createDirectoryReadCacheKey } from './create-directory-read-cache-key';
import { DirectoryReadCache } from './directory-read.cache';
import { DirectoryReadThrottle } from './directory-read.throttle';
import { DirectorySyncConfigurationLoader } from './directory-sync-configuration.loader';
import { DirectorySyncError } from './directory-sync.error';
import { DirectorySyncProviderResolver } from './directory-sync-provider.resolver';
import { DIRECTORY_SYNC_CLOCK } from './directory-sync.tokens';
import type {
  DirectoryReadOperation,
  DirectoryReadResult,
  DirectoryReadScopeInput,
  DirectorySyncClock,
  DirectorySyncConfiguration,
} from './directory-sync.types';
import { DirectorySyncStatusStore } from './directory-sync-status.store';
import { mapDirectorySyncError } from './map-directory-sync-error';
import { materializeDirectoryRead } from './materialize-directory-read';
import { parseDirectoryReadOperation } from './parse-directory-read-operation';
import { parseDirectoryReadScope } from './parse-directory-read-scope';

@Injectable()
export class DirectorySyncService {
  constructor(
    private readonly configurationLoader: DirectorySyncConfigurationLoader,
    private readonly providerResolver: DirectorySyncProviderResolver,
    private readonly directoryReadCache: DirectoryReadCache,
    private readonly directoryReadThrottle: DirectoryReadThrottle,
    private readonly prisma: PrismaService,
    private readonly statusStore: DirectorySyncStatusStore,
    @Inject(DIRECTORY_SYNC_CLOCK) private readonly clock: DirectorySyncClock,
    // Phase 2.2: optional so the tests can build the service without Redis.
    @Optional()
    private readonly principalContextInvalidator?: PrincipalContextInvalidator,
  ) {}

  async read(input: {
    readonly operation: unknown;
    readonly scope: DirectoryReadScopeInput | undefined;
    readonly forceRefresh?: boolean;
  }): Promise<DirectoryReadResult> {
    try {
      return await this.executeRead(input);
    } catch (error) {
      throw mapDirectorySyncError(error);
    }
  }

  async listDirectoryUsersForLinking(): Promise<DirectoryReadResult['users']> {
    try {
      return await this.executeListDirectoryUsersForLinking();
    } catch (error) {
      throw mapDirectorySyncError(error);
    }
  }

  private async executeListDirectoryUsersForLinking(): Promise<
    DirectoryReadResult['users']
  > {
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled) {
      throw new DirectorySyncError('DIRECTORY_READ_DISABLED');
    }
    const provider = this.providerResolver.resolve(
      configuration.strategy,
      configuration.source,
    );
    const scope = parseDirectoryReadScope({
      operation: 'users',
      scope: {
        distinguishedName: configuration.usersBaseDistinguishedName,
        includeSubtree: true,
      },
      usersBaseDistinguishedName: configuration.usersBaseDistinguishedName,
      groupsBaseDistinguishedName: configuration.groupsBaseDistinguishedName,
    });
    const result = await provider.read({ operation: 'users', scope });
    return result.users;
  }

  private async executeRead(input: {
    readonly operation: unknown;
    readonly scope: DirectoryReadScopeInput | undefined;
    readonly forceRefresh?: boolean;
  }): Promise<DirectoryReadResult> {
    const configuration = await this.configurationLoader.load();
    const operation = parseDirectoryReadOperation(input.operation);
    const scope = parseDirectoryReadScope({
      operation,
      scope: input.scope,
      usersBaseDistinguishedName: configuration.usersBaseDistinguishedName,
      groupsBaseDistinguishedName: configuration.groupsBaseDistinguishedName,
    });
    if (!configuration.enabled) {
      throw new DirectorySyncError('DIRECTORY_READ_DISABLED');
    }
    const provider = this.providerResolver.resolve(
      configuration.strategy,
      configuration.source,
    );
    const cacheKey = createDirectoryReadCacheKey({
      strategy: provider.strategy,
      operation,
      scope,
      source: configuration.source,
    });
    const nowMilliseconds = this.clock();
    const forceRefresh = input.forceRefresh === true;
    if (!forceRefresh) {
      const cached = this.directoryReadCache.get(cacheKey, nowMilliseconds);
      if (cached !== undefined) {
        return cached;
      }
    }
    this.directoryReadThrottle.acquire({
      maxQueriesPerSecond: configuration.maxQueriesPerSecond,
      nowMilliseconds,
    });
    const result = await provider.read({ operation, scope });
    await materializeDirectoryRead(this.prisma, result, (userIds) =>
      this.principalContextInvalidator?.invalidateUsers(userIds) ??
      Promise.resolve(null),
    );
    this.statusStore.markSuccessfulRead(nowMilliseconds);
    this.directoryReadCache.set({
      cacheKey,
      value: result,
      timeToLiveMilliseconds: resolveCacheTimeToLiveMilliseconds(
        operation,
        configuration,
      ),
      nowMilliseconds,
    });
    return result;
  }
}

function resolveCacheTimeToLiveMilliseconds(
  operation: DirectoryReadOperation,
  configuration: DirectorySyncConfiguration,
): number {
  if (operation === 'organizational_units') {
    return configuration.organizationalUnitCacheTimeToLiveMilliseconds;
  }
  return configuration.cacheTimeToLiveMilliseconds;
}
