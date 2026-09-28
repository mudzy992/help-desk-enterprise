import { Injectable } from '@nestjs/common';
import { opsDefaults } from '../settings/definitions/ops-settings';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';

export type StatusPageConfiguration = {
  readonly enabled: boolean;
  readonly public: boolean;
  readonly historyDays: number;
  readonly showUptimePercent: boolean;
};

export const fallbackStatusPageConfiguration: StatusPageConfiguration = {
  enabled: opsDefaults.statusPageEnabled,
  public: opsDefaults.statusPagePublic,
  historyDays: opsDefaults.statusPageHistoryDays,
  showUptimePercent: opsDefaults.statusPageShowUptimePercent,
};

/** Paket 2.7 (§10): `private.statusPage.*`. A broken read falls back to defaults (never public). */
@Injectable()
export class StatusPageConfigurationLoader {
  constructor(private readonly settings: SettingsService) {}

  async load(): Promise<StatusPageConfiguration> {
    const read = (key: string) => this.settings.getSetting(key).catch(() => undefined);
    const [enabled, isPublic, historyDays, showUptime] = await Promise.all([
      read(settingKeys.privateStatusPageEnabled),
      read(settingKeys.privateStatusPagePublic),
      read(settingKeys.privateStatusPageHistoryDays),
      read(settingKeys.privateStatusPageShowUptimePercent),
    ]);
    const days = typeof historyDays === 'number' && Number.isInteger(historyDays) ? historyDays : fallbackStatusPageConfiguration.historyDays;
    return {
      enabled: typeof enabled === 'boolean' ? enabled : fallbackStatusPageConfiguration.enabled,
      public: isPublic === true,
      historyDays: Math.min(365, Math.max(7, days)),
      showUptimePercent: typeof showUptime === 'boolean' ? showUptime : fallbackStatusPageConfiguration.showUptimePercent,
    };
  }
}
