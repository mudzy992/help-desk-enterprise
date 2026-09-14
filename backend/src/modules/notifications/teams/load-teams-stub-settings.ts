import { parseSettingsCsv } from '../email/parse-settings-csv';
import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';

export type TeamsStubSettings = {
  readonly stubEnabled: boolean;
  readonly eventTypeTokens: ReadonlySet<string>;
};

export async function loadTeamsStubSettings(
  settingsService: SettingsService,
): Promise<TeamsStubSettings> {
  return {
    stubEnabled:
      (await settingsService.getSetting(
        settingKeys.privateIntegrationsTeamsStubEnabled,
      )) === true,
    eventTypeTokens: new Set(
      parseSettingsCsv(
        await settingsService.getSetting(
          settingKeys.privateIntegrationsTeamsEventTypesCsv,
        ),
      ),
    ),
  };
}
