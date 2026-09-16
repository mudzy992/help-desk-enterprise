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
] as const;

export const defaultReportPacksJson = JSON.stringify([...defaultReportPackKeys]);
export const defaultReportExportFormatsCsv = 'csv,json';
export const defaultBottleneckWindowDays = 30;

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
