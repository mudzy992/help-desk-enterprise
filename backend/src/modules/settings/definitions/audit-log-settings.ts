import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const defaultAuditExportAllowedFormatsCsv = 'csv,json';
export const defaultAuditTamperEvidentHashAlgorithm = 'sha256';

export const auditLogSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateAuditExportEnabled,
    categoryId: settingCategoryIds.privateAudit,
    valueType: 'boolean',
    description: 'Enable OU-scoped audit log export as CSV or JSON',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuditExportAllowedFormatsCsv,
    categoryId: settingCategoryIds.privateAudit,
    valueType: 'string',
    description: 'Comma-separated audit export formats: csv, json',
    isRequired: true,
    defaultValue: defaultAuditExportAllowedFormatsCsv,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuditTamperEvidentEnabled,
    categoryId: settingCategoryIds.privateAudit,
    valueType: 'boolean',
    description: 'Enable tamper-evident hash-chain verification of audit logs',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuditTamperEvidentHashAlgorithm,
    categoryId: settingCategoryIds.privateAudit,
    valueType: 'string',
    description: 'Hash algorithm used when appending audit log chain entries',
    isRequired: true,
    defaultValue: defaultAuditTamperEvidentHashAlgorithm,
  }),
];
