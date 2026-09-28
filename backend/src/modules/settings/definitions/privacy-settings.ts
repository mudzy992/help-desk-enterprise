import { definePrivateSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition, SettingValue } from '../settings.types';

/**
 * Paket 2.6 (§7.1): retention categories. `0` = disabled (default for every
 * category that deletes business content until the DPO sets a period); any
 * other value must respect the minimum so a typo cannot wipe recent data.
 */
export const privacyRetentionMinimumDays = {
  attachments: 90,
  ticketContent: 180,
  audit: 365,
  sessions: 30,
  emailDeliveries: 30,
  requestRegister: 365,
} as const;

export const privacyRetentionMaximumDays = 36_500;

export const privacyDefaults = {
  sessionDays: 90,
  emailDeliveryDays: 180,
  requestRegisterDays: 1825,
  runAtLocalTime: '02:30',
  maxMinutesPerNight: 30,
  candidateAfterDays: 180,
  exportMaxAttachmentMb: 500,
  exportLinkValidDays: 7,
  reminderDaysCsv: '7,1',
} as const;

const category = settingCategoryIds.privatePrivacy;

export const privacySettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privatePrivacyEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Show the privacy module (requests, exports, anonymization, retention)',
    isRequired: true,
    defaultValue: true,
  }),
  retentionSetting(
    settingKeys.privatePrivacyRetentionAttachmentsDays,
    'Days after closing before attachments of a ticket are deleted (0 = disabled)',
    0,
    privacyRetentionMinimumDays.attachments,
  ),
  retentionSetting(
    settingKeys.privatePrivacyRetentionTicketContentDays,
    'Days after closing before ticket content is redacted (0 = disabled)',
    0,
    privacyRetentionMinimumDays.ticketContent,
  ),
  retentionSetting(
    settingKeys.privatePrivacyRetentionAuditDays,
    'Days audit entries are kept; older entries are purged with a chain checkpoint (0 = disabled)',
    0,
    privacyRetentionMinimumDays.audit,
  ),
  retentionSetting(
    settingKeys.privatePrivacyRetentionSessionDays,
    'Days ended sessions (IP address, browser) are kept (0 = disabled)',
    privacyDefaults.sessionDays,
    privacyRetentionMinimumDays.sessions,
  ),
  retentionSetting(
    settingKeys.privatePrivacyRetentionEmailDeliveryDays,
    'Days e-mail delivery records (recipient address) are kept (0 = disabled)',
    privacyDefaults.emailDeliveryDays,
    privacyRetentionMinimumDays.emailDeliveries,
  ),
  retentionSetting(
    settingKeys.privatePrivacyRetentionRequestRegisterDays,
    'Days closed data subject requests are kept (0 = disabled)',
    privacyDefaults.requestRegisterDays,
    privacyRetentionMinimumDays.requestRegister,
  ),
  definePrivateSetting({
    key: settingKeys.privatePrivacyRetentionRunAtLocalTime,
    categoryId: category,
    valueType: 'string',
    description: 'Local time (HH:mm, Europe/Sarajevo) of the nightly retention run',
    isRequired: true,
    defaultValue: privacyDefaults.runAtLocalTime,
    assertValue: assertLocalTime,
  }),
  definePrivateSetting({
    key: settingKeys.privatePrivacyRetentionMaxMinutesPerNight,
    categoryId: category,
    valueType: 'number',
    description: 'Maximum minutes the nightly retention run may take (5-240)',
    isRequired: true,
    defaultValue: privacyDefaults.maxMinutesPerNight,
    assertValue: integerRange(5, 240),
  }),
  definePrivateSetting({
    key: settingKeys.privatePrivacyAnonymizationCandidateAfterDays,
    categoryId: category,
    valueType: 'number',
    description: 'Days after deactivation before a user is listed as an anonymization candidate (30-3650)',
    isRequired: true,
    defaultValue: privacyDefaults.candidateAfterDays,
    assertValue: integerRange(30, 3650),
  }),
  definePrivateSetting({
    key: settingKeys.privatePrivacyAnonymizationRequireSecondApprover,
    categoryId: category,
    valueType: 'boolean',
    description: 'Anonymization needs approval of a second SUPER_ADMIN (four eyes)',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privatePrivacyAnonymizationDeleteOwnAttachmentsDefault,
    categoryId: category,
    valueType: 'boolean',
    description: 'Pre-select deleting the attachments the person uploaded when anonymizing',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privatePrivacyExportIncludeAttachmentsDefault,
    categoryId: category,
    valueType: 'boolean',
    description: 'Pre-select including the person’s own attachments in a data export',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privatePrivacyExportMaxAttachmentMb,
    categoryId: category,
    valueType: 'number',
    description: 'Maximum size of attachments in one data export, in MB (10-2000)',
    isRequired: true,
    defaultValue: privacyDefaults.exportMaxAttachmentMb,
    assertValue: integerRange(10, 2000),
  }),
  definePrivateSetting({
    key: settingKeys.privatePrivacyExportLinkValidDays,
    categoryId: category,
    valueType: 'number',
    description: 'Days a finished data export can be downloaded before it is deleted (1-30)',
    isRequired: true,
    defaultValue: privacyDefaults.exportLinkValidDays,
    assertValue: integerRange(1, 30),
  }),
  definePrivateSetting({
    key: settingKeys.privatePrivacyRequestsReminderDaysCsv,
    categoryId: category,
    valueType: 'string',
    description: 'Days before the due date of a data subject request when a reminder is sent (e.g. 7,1)',
    isRequired: true,
    defaultValue: privacyDefaults.reminderDaysCsv,
    assertValue: assertReminderDays,
  }),
  textSetting(
    settingKeys.privatePrivacyRequestsRejectionNoticeBs,
    'Text of the notice about the right to complain to the Agency, added to a rejection (Bosnian)',
    4000,
  ),
  textSetting(
    settingKeys.privatePrivacyRequestsRejectionNoticeEn,
    'Text of the notice about the right to complain to the Agency, added to a rejection (English)',
    4000,
  ),
  textSetting(settingKeys.privatePrivacyControllerName, 'Controller: name of the institution', 300),
  textSetting(settingKeys.privatePrivacyControllerAddress, 'Controller: address and contact', 500),
  textSetting(settingKeys.privatePrivacyControllerDpoName, 'Data protection officer: name', 200),
  definePrivateSetting({
    key: settingKeys.privatePrivacyControllerDpoEmail,
    categoryId: category,
    valueType: 'string',
    description: 'Data protection officer: e-mail',
    isRequired: false,
    defaultValue: '',
    assertValue: optionalEmail,
  }),
  textSetting(settingKeys.privatePrivacyControllerPurpose, 'Purpose of processing in the help desk', 2000),
  textSetting(settingKeys.privatePrivacyControllerLegalBasis, 'Legal basis of processing', 2000),
  textSetting(settingKeys.privatePrivacyNoticeBs, 'Privacy notice shown to users, Markdown (Bosnian)', 20_000),
  textSetting(settingKeys.privatePrivacyNoticeEn, 'Privacy notice shown to users, Markdown (English)', 20_000),
];

function retentionSetting(
  key: string,
  description: string,
  defaultValue: number,
  minimumDays: number,
): SettingDefinition {
  return definePrivateSetting({
    key: key as (typeof settingKeys)[keyof typeof settingKeys],
    categoryId: category,
    valueType: 'number',
    description,
    isRequired: true,
    defaultValue,
    assertValue: (value) => assertRetentionDays(value, minimumDays),
  });
}

function textSetting(key: string, description: string, maxLength: number): SettingDefinition {
  return definePrivateSetting({
    key: key as (typeof settingKeys)[keyof typeof settingKeys],
    categoryId: category,
    valueType: 'string',
    description,
    isRequired: false,
    defaultValue: '',
    assertValue: (value) => {
      if (typeof value !== 'string' || value.length > maxLength) {
        throw new SettingsError(`Text must be at most ${maxLength} characters`);
      }
    },
  });
}

export function assertRetentionDays(value: SettingValue, minimumDays: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new SettingsError('Retention must be a whole number of days');
  }
  if (value === 0) return;
  if (value < minimumDays || value > privacyRetentionMaximumDays) {
    throw new SettingsError(
      `Retention must be 0 (disabled) or between ${minimumDays} and ${privacyRetentionMaximumDays} days`,
    );
  }
}

function integerRange(min: number, max: number): (value: SettingValue) => void {
  return (value) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new SettingsError(`Value must be an integer between ${min} and ${max}`);
    }
  };
}

function assertLocalTime(value: SettingValue): void {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new SettingsError('Time must be HH:mm (00:00-23:59)');
  }
}

/** `7,1` → [7, 1]; distinct integers 1-30, at most five. */
export function parseReminderDays(value: string): readonly number[] {
  const days = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(Number);
  if (
    days.length === 0 ||
    days.length > 5 ||
    days.some((day) => !Number.isInteger(day) || day < 1 || day > 30) ||
    new Set(days).size !== days.length
  ) {
    throw new SettingsError('Reminder days must be 1-5 distinct integers between 1 and 30');
  }
  return [...days].sort((left, right) => right - left);
}

function assertReminderDays(value: SettingValue): void {
  if (typeof value !== 'string') {
    throw new SettingsError('Reminder days must be a comma-separated list');
  }
  parseReminderDays(value);
}

function optionalEmail(value: SettingValue): void {
  if (typeof value !== 'string') {
    throw new SettingsError('E-mail must be a string');
  }
  if (value.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new SettingsError('E-mail address is not valid');
  }
}
