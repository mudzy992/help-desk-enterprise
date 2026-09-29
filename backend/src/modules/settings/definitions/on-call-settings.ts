import { definePrivateSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition } from '../settings.types';

/** Paket 2.9 (K3, §6): defaults, also used by the loader when a value is missing. */
export const onCallDefaults = {
  enabled: false,
  reminderTime: '15:00',
  historyRetentionDays: 730,
} as const;

const clockPattern = /^([01]\d|2[0-3]):(00|15|30|45)$/;

export const onCallSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateOnCallEnabled,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'boolean',
    description: 'Enable on-call schedules (rotation, overrides, escalation to the on-call agent)',
    isRequired: true,
    defaultValue: onCallDefaults.enabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateOnCallReminderTime,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'string',
    description: 'Time of the reminder the day before a shift (HH:MM, 15-minute steps, schedule time zone)',
    isRequired: true,
    defaultValue: onCallDefaults.reminderTime,
    assertValue: (value) => {
      if (typeof value !== 'string' || !clockPattern.test(value)) {
        throw new SettingsError('Reminder time must be HH:MM in 15-minute steps');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateOnCallHistoryRetentionDays,
    categoryId: settingCategoryIds.privateWorkflow,
    valueType: 'number',
    description: 'Days to keep past overrides and swap requests (0 = keep; 90-3650)',
    isRequired: true,
    defaultValue: onCallDefaults.historyRetentionDays,
    assertValue: (value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || (value !== 0 && (value < 90 || value > 3650))) {
        throw new SettingsError('Retention must be 0 or 90-3650 days');
      }
    },
  }),
];
