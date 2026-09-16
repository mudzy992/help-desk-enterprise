import { Injectable } from '@nestjs/common';
import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncConfigurationLoader } from './directory-sync-configuration.loader';
import type { DirectorySyncStatusResponse } from './directory-sync-status.types';
import { DirectorySyncStatusStore } from './directory-sync-status.store';

@Injectable()
export class DirectorySyncStatusService {
  constructor(
    private readonly configurationLoader: DirectorySyncConfigurationLoader,
    private readonly statusStore: DirectorySyncStatusStore,
  ) {}

  async getStatus(): Promise<DirectorySyncStatusResponse> {
    const configuration = await this.configurationLoader.load();
    return {
      enabled: configuration.enabled,
      strategy: configuration.strategy,
      maxQueriesPerSecond: configuration.maxQueriesPerSecond,
      cacheTtlMinutes:
        configuration.cacheTimeToLiveMilliseconds /
        directorySyncConstants.millisecondsPerMinute,
      ouTreeCacheTtlHours:
        configuration.organizationalUnitCacheTimeToLiveMilliseconds /
        directorySyncConstants.millisecondsPerHour,
      lastSuccessfulReadAt: this.statusStore.getLastSuccessfulReadAt(),
    };
  }
}
