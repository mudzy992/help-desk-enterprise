import { Injectable, Optional } from '@nestjs/common';
import { directorySyncConstants } from './directory-sync.constants';
import { DirectorySyncConfigurationLoader } from './directory-sync-configuration.loader';
import { DirectorySyncError } from './directory-sync.error';
import type { DirectorySyncStatusResponse } from './directory-sync-status.types';
import { DirectorySyncStatusStore } from './directory-sync-status.store';
import { DirectoryBackoff } from './ldaps/directory-backoff';
import {
  assertLdapsConfigured,
  LdapsSyncConfigurationLoader,
} from './ldaps/ldaps-sync-configuration.loader';

@Injectable()
export class DirectorySyncStatusService {
  constructor(
    private readonly configurationLoader: DirectorySyncConfigurationLoader,
    private readonly statusStore: DirectorySyncStatusStore,
    @Optional() private readonly ldapsConfigurationLoader?: LdapsSyncConfigurationLoader,
    @Optional() private readonly backoff?: DirectoryBackoff,
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
      source: configuration.source,
      ldaps: await this.describeLdaps(),
    };
  }

  /** Never returns the bind DN or password — only whether they are set. */
  private async describeLdaps(): Promise<DirectorySyncStatusResponse['ldaps']> {
    if (this.ldapsConfigurationLoader === undefined) {
      return null;
    }
    let ldaps;
    try {
      ldaps = await this.ldapsConfigurationLoader.load();
    } catch {
      return null;
    }
    let missing: readonly string[] = [];
    try {
      assertLdapsConfigured(ldaps);
    } catch (error) {
      if (error instanceof DirectorySyncError && Array.isArray(error.details?.missing)) {
        missing = error.details.missing as string[];
      }
    }
    return {
      domainControllers: ldaps.connection.urls,
      bindConfigured: ldaps.connection.bindDn !== '' && ldaps.connection.bindPassword !== '',
      usersBaseDn: ldaps.usersBaseDn,
      groupsBaseDn: ldaps.groupsBaseDn,
      customCaCertificate: ldaps.connection.caCertificatePem !== null,
      pageSize: ldaps.pageSize,
      scheduleCron: ldaps.scheduleCron,
      ouMappingStrategy: ldaps.ouMappingStrategy,
      ouMappingOverrides: ldaps.ouMappingOverrides.length,
      roleSource: ldaps.roleSource,
      maxDeactivationPercent: ldaps.maxDeactivationPercent,
      syncCooldownMinutes: ldaps.syncCooldownMilliseconds / 60_000,
      backoff: this.backoff?.snapshot(ldaps.retryBackoffMilliseconds) ?? {
        retryAt: null,
        lastErrorCode: null,
      },
      missing,
    };
  }
}
