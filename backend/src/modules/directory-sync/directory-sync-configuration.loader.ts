import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { DirectorySyncError } from './directory-sync.error';
import type { DirectorySyncConfiguration } from './directory-sync.types';
import { parseDirectorySyncConfiguration } from './parse-directory-sync-configuration';

@Injectable()
export class DirectorySyncConfigurationLoader {
  constructor(private readonly settingsService: SettingsService) {}

  async load(): Promise<DirectorySyncConfiguration> {
    try {
      return parseDirectorySyncConfiguration({
        enabled: await this.settingsService.getSetting(
          settingKeys.privateAuthAdReadEnabled,
        ),
        strategy: await this.settingsService.getSetting(
          settingKeys.privateAuthAdReadStrategy,
        ),
        usersBaseDistinguishedName: await this.settingsService.getSetting(
          settingKeys.privateAuthAdReadUsersBaseDn,
        ),
        groupsBaseDistinguishedName: await this.settingsService.getSetting(
          settingKeys.privateAuthAdReadGroupsBaseDn,
        ),
        maxQueriesPerSecond: await this.settingsService.getSetting(
          settingKeys.privateAuthAdReadMaxQueriesPerSecond,
        ),
        cacheTimeToLiveMinutes: await this.settingsService.getSetting(
          settingKeys.privateAuthAdReadCacheTtlMinutes,
        ),
        organizationalUnitCacheTimeToLiveHours:
          await this.settingsService.getSetting(
            settingKeys.privateAuthAdReadOuTreeCacheTtlHours,
          ),
      });
    } catch (error) {
      if (error instanceof DirectorySyncError) {
        throw error;
      }
      throw new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE');
    }
  }
}
