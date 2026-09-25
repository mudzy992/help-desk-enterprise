import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { SettingsError } from '../settings.error';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition, SettingValue } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const defaultReportPackKeys = [
  'monthly_kpi',
  'overdue_by_service',
  'top_close_codes',
  'kb_helpfulness',
  'forward_ping_pong',
] as const;

export const defaultReportPacksJson = JSON.stringify([...defaultReportPackKeys]);
export const defaultReportExportFormatsCsv = 'csv,json';
export const defaultBottleneckWindowDays = 30;
/** Package 1.6: a ticket forwarded at least this many times is "ping-pong". */
export const defaultPingPongThreshold = 3;
export const pingPongThresholdRange = { min: 2, max: 20 } as const;

/**
 * The zone the reporting day starts in. One help desk serves one working day —
 * the deployment this runs in is `Europe/Sarajevo` — and the value is a setting
 * rather than a process constant so that the boundary never depends on the
 * `TZ` of whichever machine happens to run the query.
 */
export const defaultReportsTimeZone = 'Europe/Sarajevo';

export const reportsSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateReportsEnabled,
    categoryId: settingCategoryIds.privateReports,
    valueType: 'boolean',
    description: 'Enable predefined report pack CSV/JSON exports',
    isRequired: true,
    defaultValue: true,
  }),
  defineSecretSetting({
    key: settingKeys.privateReportsPacksJson,
    categoryId: settingCategoryIds.privateReports,
    valueType: 'string',
    description: 'JSON array of enabled report pack keys',
    isRequired: false,
    assertValue: assertReportPacksJson,
  }),
  definePrivateSetting({
    key: settingKeys.privateReportsExportFormatsCsv,
    categoryId: settingCategoryIds.privateReports,
    valueType: 'string',
    description: 'Comma-separated report export formats: csv, json',
    isRequired: true,
    defaultValue: defaultReportExportFormatsCsv,
  }),
  definePrivateSetting({
    key: settingKeys.privateReportsTimeZone,
    categoryId: settingCategoryIds.privateReports,
    valueType: 'string',
    description:
      'IANA time zone of the reporting day boundary (dashboard "opened today")',
    isRequired: true,
    defaultValue: defaultReportsTimeZone,
    assertValue: assertIanaTimeZone,
  }),
  definePrivateSetting({
    key: settingKeys.privateReportsPingPongThreshold,
    categoryId: settingCategoryIds.privateReports,
    valueType: 'number',
    description:
      'Forward ping-pong report: minimum number of group-to-group forwards (2-20)',
    isRequired: true,
    defaultValue: defaultPingPongThreshold,
    assertValue: assertPingPongThreshold,
  }),
  definePrivateSetting({
    key: settingKeys.privateDashboardBottlenecksEnabled,
    categoryId: settingCategoryIds.privateDashboard,
    valueType: 'boolean',
    description: 'Enable bottleneck dashboard aggregations',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateDashboardBottlenecksDefaultWindowDays,
    categoryId: settingCategoryIds.privateDashboard,
    valueType: 'number',
    description: 'Default rolling window in days for bottleneck trends',
    isRequired: true,
    defaultValue: defaultBottleneckWindowDays,
    assertValue: assertPositiveInteger,
  }),
];

/** Rejects anything `Intl` cannot resolve as a zone name, so a typo is a 400. */
function assertIanaTimeZone(value: SettingValue): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SettingsError('Reports time zone must be an IANA zone name');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format(new Date());
  } catch {
    throw new SettingsError(
      `Reports time zone is not a known IANA zone: ${value}`,
    );
  }
}

function assertPositiveInteger(value: SettingValue): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new SettingsError(
      'Bottleneck window days must be a positive integer',
    );
  }
}

function assertReportPacksJson(value: SettingValue): void {
  if (typeof value !== 'string') {
    throw new SettingsError('Report packs JSON must be a string');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new SettingsError('Report packs JSON is not valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new SettingsError('Report packs JSON must be an array of pack keys');
  }
  const allowed = new Set<string>(defaultReportPackKeys);
  if (parsed.some((item) => typeof item !== 'string' || !allowed.has(item))) {
    throw new SettingsError('Report packs JSON contains an unknown pack key');
  }
}

function assertPingPongThreshold(value: SettingValue): void {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < pingPongThresholdRange.min ||
    value > pingPongThresholdRange.max
  ) {
    throw new SettingsError('Ping-pong threshold must be an integer between 2 and 20');
  }
}
