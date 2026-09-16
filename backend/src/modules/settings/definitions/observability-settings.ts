import { definePrivateSetting } from '../registry/define-setting';
import { SettingsError } from '../settings.error';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition, SettingValue } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const defaultObservabilityAuditRetentionDays = 90;
export const defaultObservabilityRequestLogRetentionDays = 14;
export const defaultSupportBundleRecentLogsMinutes = 60;

export const observabilitySettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateObservabilityAuditRetentionDays,
    categoryId: settingCategoryIds.privateObservability,
    valueType: 'number',
    description: 'How many days to retain audit log records',
    isRequired: true,
    defaultValue: defaultObservabilityAuditRetentionDays,
    assertValue: assertPositiveInteger,
  }),
  definePrivateSetting({
    key: settingKeys.privateObservabilityRequestLogRetentionDays,
    categoryId: settingCategoryIds.privateObservability,
    valueType: 'number',
    description: 'How many days of in-process request logs the API retains',
    isRequired: true,
    defaultValue: defaultObservabilityRequestLogRetentionDays,
    assertValue: assertPositiveInteger,
  }),
  definePrivateSetting({
    key: settingKeys.privateObservabilitySupportBundleEnabled,
    categoryId: settingCategoryIds.privateObservability,
    valueType: 'boolean',
    description: 'Allow SuperAdmin to download a support bundle archive',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateObservabilitySupportBundleIncludeConfigSnapshot,
    categoryId: settingCategoryIds.privateObservability,
    valueType: 'boolean',
    description: 'Include the current config snapshot in the support bundle',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateObservabilitySupportBundleIncludeRecentLogs,
    categoryId: settingCategoryIds.privateObservability,
    valueType: 'boolean',
    description: 'Include recent in-process request logs in the support bundle',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateObservabilitySupportBundleIncludeAuditExport,
    categoryId: settingCategoryIds.privateObservability,
    valueType: 'boolean',
    description: 'Include the audit log export in the support bundle',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateObservabilitySupportBundleRecentLogsMinutes,
    categoryId: settingCategoryIds.privateObservability,
    valueType: 'number',
    description: 'How many minutes of recent logs to include in the support bundle',
    isRequired: true,
    defaultValue: defaultSupportBundleRecentLogsMinutes,
    assertValue: assertPositiveInteger,
  }),
];

function assertPositiveInteger(value: SettingValue): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new SettingsError('Observability numeric settings must be positive integers');
  }
}
