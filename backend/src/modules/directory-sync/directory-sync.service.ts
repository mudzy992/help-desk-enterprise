import { Inject, Injectable } from '@nestjs/common';
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
import { mapDirectorySyncError } from './map-directory-sync-error';
import { parseDirectoryReadOperation } from './parse-directory-read-operation';
import { parseDirectoryReadScope } from './parse-directory-read-scope';

@Injectable()
export class DirectorySyncService {
  constructor(
    private readonly configurationLoader: DirectorySyncConfigurationLoader,
    private readonly providerResolver: DirectorySyncProviderResolver,
    private readonly directoryReadCache: DirectoryReadCache,
    private readonly directoryReadThrottle: DirectoryReadThrottle,
    @Inject(DIRECTORY_SYNC_CLOCK) private readonly clock: DirectorySyncClock,
  ) {}

  async read(input: {
    readonly operation: unknown;
    readonly scope: DirectoryReadScopeInput | undefined;
  }): Promise<DirectoryReadResult> {
    try {
      return await this.executeRead(input);
    } catch (error) {
      throw mapDirectorySyncError(error);
    }
  }

  private async executeRead(input: {
    readonly operation: unknown;
    readonly scope: DirectoryReadScopeInput | undefined;
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
    const provider = this.providerResolver.resolve(configuration.strategy);
    const cacheKey = createDirectoryReadCacheKey({
      strategy: provider.strategy,
      operation,
      scope,
    });
    const nowMilliseconds = this.clock();
    const cached = this.directoryReadCache.get(cacheKey, nowMilliseconds);
    if (cached !== undefined) {
      return cached;
    }
    this.directoryReadThrottle.acquire({
      maxQueriesPerSecond: configuration.maxQueriesPerSecond,
      nowMilliseconds,
    });
    const result = await provider.read({ operation, scope });
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
