import { Injectable } from '@nestjs/common';
import { opsDefaults, parseEmailCsv } from '../settings/definitions/ops-settings';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import type { OpsThresholds } from './evaluate-ops-signals';

export type OpsConfiguration = {
  readonly alertsEnabled: boolean;
  readonly reminderHours: number;
  readonly extraRecipients: readonly string[];
  readonly teamsWebhookUrl: string | null;
  readonly historyDays: number;
  readonly thresholds: OpsThresholds;
};

/** Paket 2.7 (§10): settings of alarms and thresholds, defaults when a value is missing. */
@Injectable()
export class OpsConfigurationLoader {
  constructor(private readonly settings: SettingsService) {}

  async load(): Promise<OpsConfiguration> {
    const get = (key: string) => this.settings.getSetting(key);
    const [enabled, reminder, extra, teams, history, diskWarn, diskCritical, count5xx, percent5xx, slaLate, heartbeat, clamav] =
      await Promise.all([
        get(settingKeys.privateOpsAlertsEnabled),
        get(settingKeys.privateOpsAlertsReminderHours),
        get(settingKeys.privateOpsAlertsExtraRecipientsCsv),
        this.settings.getSecretForInternalUse(settingKeys.privateOpsAlertsTeamsWebhookUrl),
        get(settingKeys.privateOpsAlertsHistoryDays),
        get(settingKeys.privateOpsThresholdsDiskWarnPercent),
        get(settingKeys.privateOpsThresholdsDiskCriticalPercent),
        get(settingKeys.privateOpsThresholdsHttp5xxMinCount),
        get(settingKeys.privateOpsThresholdsHttp5xxMinPercent),
        get(settingKeys.privateOpsThresholdsSlaScanLateMinutes),
        get(settingKeys.privateOpsThresholdsWorkerHeartbeatStaleSeconds),
        get(settingKeys.privateOpsThresholdsClamavFailuresBeforeAlert),
      ]);
    const warn = int(diskWarn, opsDefaults.diskWarnPercent);
    return {
      alertsEnabled: typeof enabled === 'boolean' ? enabled : opsDefaults.alertsEnabled,
      reminderHours: int(reminder, opsDefaults.reminderHours),
      extraRecipients: typeof extra === 'string' ? parseEmailCsv(extra) : [],
      teamsWebhookUrl: typeof teams === 'string' && teams.trim().startsWith('https://') ? teams.trim() : null,
      historyDays: int(history, opsDefaults.historyDays),
      thresholds: {
        diskWarnPercent: warn,
        // A critical level at or under the warning level would skip WARNING entirely.
        diskCriticalPercent: Math.max(warn + 1, int(diskCritical, opsDefaults.diskCriticalPercent)),
        http5xxMinCount: int(count5xx, opsDefaults.http5xxMinCount),
        http5xxMinPercent: int(percent5xx, opsDefaults.http5xxMinPercent),
        slaScanLateMinutes: int(slaLate, opsDefaults.slaScanLateMinutes),
        workerHeartbeatStaleSeconds: int(heartbeat, opsDefaults.workerHeartbeatStaleSeconds),
        clamavFailuresBeforeAlert: int(clamav, opsDefaults.clamavFailuresBeforeAlert),
      },
    };
  }
}

function int(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Used when the database is unreachable and settings cannot be read. */
export const fallbackOpsConfiguration: OpsConfiguration = {
  alertsEnabled: true,
  reminderHours: opsDefaults.reminderHours,
  extraRecipients: [],
  teamsWebhookUrl: null,
  historyDays: opsDefaults.historyDays,
  thresholds: {
    diskWarnPercent: opsDefaults.diskWarnPercent,
    diskCriticalPercent: opsDefaults.diskCriticalPercent,
    http5xxMinCount: opsDefaults.http5xxMinCount,
    http5xxMinPercent: opsDefaults.http5xxMinPercent,
    slaScanLateMinutes: opsDefaults.slaScanLateMinutes,
    workerHeartbeatStaleSeconds: opsDefaults.workerHeartbeatStaleSeconds,
    clamavFailuresBeforeAlert: opsDefaults.clamavFailuresBeforeAlert,
  },
};
