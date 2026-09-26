import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition, SettingValue } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';
import { SettingsError } from '../settings.error';

/** Paket 1.8 — LDAPS directory sync, OU mapping, role source, Entra login. */
export const directoryReadSources = ['manual_catalog', 'ldaps'] as const;
export const ouMappingStrategies = [
  'by_dn_ou_path',
  'by_company_department',
] as const;
export const roleSources = ['local_db', 'ad_groups'] as const;

/**
 * Active accounts with an e-mail address; disabled accounts (UAC bit 2) are
 * excluded. EPBiH extends it with its service/admin account convention.
 */
export const defaultDirectoryUserFilter =
  '(&(objectCategory=person)(objectClass=user)(mail=*)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))';

function assertIntegerBetween(minimum: number, maximum: number) {
  return (value: SettingValue): void => {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new SettingsError(
        `Value must be an integer between ${minimum} and ${maximum}`,
        'INVALID_SETTING_VALUE',
      );
    }
  };
}

function assertLdapFilter(value: SettingValue): void {
  if (typeof value !== 'string') {
    return;
  }
  const trimmed = value.trim();
  let depth = 0;
  for (const character of trimmed) {
    depth += character === '(' ? 1 : character === ')' ? -1 : 0;
    if (depth < 0) break;
  }
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')') || depth !== 0 || trimmed.length > 2000) {
    throw new SettingsError(
      'LDAP filter must be a balanced expression in parentheses',
      'INVALID_SETTING_VALUE',
    );
  }
}

function assertCronExpression(value: SettingValue): void {
  if (typeof value !== 'string') {
    return;
  }
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5 || fields.some((field) => !/^[\d*/,-]+$/.test(field))) {
    throw new SettingsError(
      'Schedule must be a 5-field cron expression',
      'INVALID_SETTING_VALUE',
    );
  }
}

function assertDistinguishedNameOrEmpty(value: SettingValue): void {
  if (typeof value !== 'string' || value.trim() === '') {
    return;
  }
  if (!/^(CN|OU)=[^,]+(,(CN|OU|DC|O)=[^,]+)+$/i.test(value.trim())) {
    throw new SettingsError(
      'Value must be a distinguished name such as CN=Group,OU=Grupe,DC=example,DC=com',
      'INVALID_SETTING_VALUE',
    );
  }
}

export const directoryLdapsSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadSource,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'Where directory reads come from: manual_catalog (records kept in the application) or ldaps (Active Directory)',
    isRequired: true,
    allowedValues: [...directoryReadSources],
    defaultValue: 'manual_catalog',
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadPageSize,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'number',
    description: 'LDAP paged search size (50–1000)',
    isRequired: true,
    defaultValue: 500,
    assertValue: assertIntegerBetween(50, 1000),
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadUserFilter,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'LDAP filter for users in scope; default keeps enabled accounts with an e-mail address',
    isRequired: true,
    defaultValue: defaultDirectoryUserFilter,
    assertValue: assertLdapFilter,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadRetryBackoffMinutes,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'number',
    description:
      'After a directory error no new LDAP query is sent for this many minutes',
    isRequired: true,
    defaultValue: 3,
    assertValue: assertIntegerBetween(0, 240),
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadSyncCooldownMinutes,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'number',
    description: 'Minimum minutes between two full directory synchronizations',
    isRequired: true,
    defaultValue: 15,
    assertValue: assertIntegerBetween(0, 1440),
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadMaxDeactivationPercent,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'number',
    description:
      'Safeguard: a sync that would deactivate more than this percent of active directory users is aborted without changes',
    isRequired: true,
    defaultValue: 10,
    assertValue: assertIntegerBetween(0, 100),
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdReadScheduleCron,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'Cron (Europe/Sarajevo) of the scheduled directory sync when the strategy is scheduled',
    isRequired: true,
    defaultValue: '30 2 * * *',
    assertValue: assertCronExpression,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthOuMappingStrategy,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'How a directory user is placed into an organizational unit: by the OU path of the DN or by company/department attributes',
    isRequired: true,
    allowedValues: [...ouMappingStrategies],
    defaultValue: 'by_dn_ou_path',
  }),
  defineSecretSetting({
    key: settingKeys.privateAuthOuMappingOverridesJson,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'JSON list of OU mapping overrides [{"dnSuffix"|"company"+"department", "ouPath"}]; overrides win over the strategy',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthRoleSource,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description:
      'Where ADMIN/AGENT roles come from: local_db (assigned in the application) or ad_groups (AD group membership on sync); SuperAdmin is always local',
    isRequired: true,
    allowedValues: [...roleSources],
    defaultValue: 'local_db',
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdRoleGroupDnAdmin,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description: 'DN of the AD group whose members get the ADMIN role (ad_groups)',
    isRequired: false,
    defaultValue: '',
    assertValue: assertDistinguishedNameOrEmpty,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthAdRoleGroupDnAgent,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'string',
    description: 'DN of the AD group whose members get the AGENT role (ad_groups)',
    isRequired: false,
    defaultValue: '',
    assertValue: assertDistinguishedNameOrEmpty,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthEntraJitProvisioning,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'boolean',
    description:
      'Create a USER account on the first Microsoft sign-in when no matching account exists',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateAuthEntraSingleLogout,
    categoryId: settingCategoryIds.privateAuth,
    valueType: 'boolean',
    description: 'Also sign out of Microsoft when signing out of the application',
    isRequired: true,
    defaultValue: false,
  }),
];
