import { definePrivateSetting, defineSecretSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition, SettingValue } from '../settings.types';

/** Paket 2.7 (§10): defaults, also used by the loader when a value is missing. */
export const opsDefaults = {
  alertsEnabled: true,
  reminderHours: 4,
  historyDays: 90,
  diskWarnPercent: 80,
  diskCriticalPercent: 90,
  http5xxMinCount: 20,
  http5xxMinPercent: 2,
  slaScanLateMinutes: 5,
  workerHeartbeatStaleSeconds: 120,
  clamavFailuresBeforeAlert: 3,
  // Package 5.2.3 (M11 B3): per-minute WebSocket room emit thresholds.
  // The legacy group-legacy bucket emits one full ticket per change per
  // subscribed agent (O(n*m)), so 300/min per room is already concerning on
  // small instances and 1500/min suggests a feedback loop. These defaults
  // cover 4 API replicas summing ~5-25 emits per second per busiest room.
  websocketEmitWarnPerMinute: 600,
  websocketEmitCriticalPerMinute: 3000,
  statusPageEnabled: true,
  statusPagePublic: false,
  statusPageHistoryDays: 90,
  statusPageShowUptimePercent: true,
} as const;

const ops = settingCategoryIds.privateObservability;
const services = settingCategoryIds.privateServices;

export const opsSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateOpsAlertsEnabled,
    categoryId: ops,
    valueType: 'boolean',
    description: 'Send operational alarms (e-mail, in-app, optional Teams)',
    isRequired: true,
    defaultValue: opsDefaults.alertsEnabled,
  }),
  number(settingKeys.privateOpsAlertsReminderHours, ops, 'Hours between reminders while an alarm stays open (1-48)', opsDefaults.reminderHours, 1, 48),
  definePrivateSetting({
    key: settingKeys.privateOpsAlertsExtraRecipientsCsv,
    categoryId: ops,
    valueType: 'string',
    description: 'Extra e-mail addresses for alarms, comma-separated (e.g. the IT on-call mailbox)',
    isRequired: false,
    defaultValue: '',
    assertValue: assertEmailCsv,
  }),
  defineSecretSetting({
    key: settingKeys.privateOpsAlertsTeamsWebhookUrl,
    categoryId: ops,
    valueType: 'string',
    description: 'Teams Workflows webhook URL for alarms (empty = off)',
    isRequired: false,
    assertValue: assertHttpsUrlOrEmpty,
  }),
  number(settingKeys.privateOpsAlertsHistoryDays, ops, 'Days resolved alarms are kept (7-365)', opsDefaults.historyDays, 7, 365),
  number(settingKeys.privateOpsThresholdsDiskWarnPercent, ops, 'Upload disk usage that raises a warning, in % (50-98)', opsDefaults.diskWarnPercent, 50, 98),
  number(settingKeys.privateOpsThresholdsDiskCriticalPercent, ops, 'Upload disk usage that raises a critical alarm, in % (51-99)', opsDefaults.diskCriticalPercent, 51, 99),
  number(settingKeys.privateOpsThresholdsHttp5xxMinCount, ops, 'Minimum number of 5xx responses in 5 minutes before alarming (1-10000)', opsDefaults.http5xxMinCount, 1, 10_000),
  number(settingKeys.privateOpsThresholdsHttp5xxMinPercent, ops, 'Minimum share of 5xx responses in 5 minutes before alarming, in % (1-100)', opsDefaults.http5xxMinPercent, 1, 100),
  number(settingKeys.privateOpsThresholdsSlaScanLateMinutes, ops, 'Minutes without a successful SLA scan before a critical alarm (2-60)', opsDefaults.slaScanLateMinutes, 2, 60),
  number(settingKeys.privateOpsThresholdsWorkerHeartbeatStaleSeconds, ops, 'Seconds without a worker heartbeat before a critical alarm (30-900)', opsDefaults.workerHeartbeatStaleSeconds, 30, 900),
  number(settingKeys.privateOpsThresholdsClamavFailuresBeforeAlert, ops, 'Consecutive failed ClamAV checks (one per minute) before alarming (1-30)', opsDefaults.clamavFailuresBeforeAlert, 1, 30),
  number(settingKeys.privateOpsThresholdsWebsocketEmitWarnPerMinute, ops, 'WebSocket room emits per minute (cluster-wide, busiest room) that raises a WARNING (10-100000)', opsDefaults.websocketEmitWarnPerMinute, 10, 100_000),
  number(settingKeys.privateOpsThresholdsWebsocketEmitCriticalPerMinute, ops, 'WebSocket room emits per minute (cluster-wide, busiest room) that raises a CRITICAL alarm (20-200000)', opsDefaults.websocketEmitCriticalPerMinute, 20, 200_000),
  definePrivateSetting({
    key: settingKeys.privateStatusPageEnabled,
    categoryId: services,
    valueType: 'boolean',
    description: 'Show the status page (service availability, incidents, planned work)',
    isRequired: true,
    defaultValue: opsDefaults.statusPageEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateStatusPagePublic,
    requires: [{ key: settingKeys.privateStatusPageEnabled, equals: true }],
    categoryId: services,
    valueType: 'boolean',
    description: 'Also show the status page without signing in (staff-only incidents stay hidden)',
    isRequired: true,
    defaultValue: opsDefaults.statusPagePublic,
  }),
  number(settingKeys.privateStatusPageHistoryDays, services, 'Days of resolved incidents shown on the status page (7-365)', opsDefaults.statusPageHistoryDays, 7, 365),
  definePrivateSetting({
    key: settingKeys.privateStatusPageShowUptimePercent,
    requires: [{ key: settingKeys.privateStatusPageEnabled, equals: true }],
    categoryId: services,
    valueType: 'boolean',
    description: 'Show the availability percentage per service on the status page',
    isRequired: true,
    defaultValue: opsDefaults.statusPageShowUptimePercent,
  }),
];

function number(key: string, categoryId: typeof ops | typeof services, description: string, defaultValue: number, min: number, max: number): SettingDefinition {
  return definePrivateSetting({
    key: key as never,
    categoryId,
    valueType: 'number',
    description,
    isRequired: true,
    defaultValue,
    assertValue: (value: SettingValue) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new SettingsError(`Value must be an integer between ${min} and ${max}`);
      }
    },
  });
}

const emailPattern = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function parseEmailCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

function assertEmailCsv(value: SettingValue): void {
  if (typeof value !== 'string') throw new SettingsError('Value must be text');
  const emails = parseEmailCsv(value);
  if (emails.length > 20) throw new SettingsError('At most 20 addresses');
  const invalid = emails.find((email) => !emailPattern.test(email));
  if (invalid !== undefined) throw new SettingsError(`Invalid e-mail address: ${invalid}`);
}

export function assertHttpsUrlOrEmpty(value: SettingValue): void {
  if (typeof value !== 'string') throw new SettingsError('Value must be text');
  if (value.trim() === '') return;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new SettingsError('Value must be an https:// URL');
  }
  if (url.protocol !== 'https:') throw new SettingsError('Value must be an https:// URL');
}
