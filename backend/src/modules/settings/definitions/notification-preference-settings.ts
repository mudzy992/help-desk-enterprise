import { configurablePreferenceCategoryKeys } from '../../notifications/preferences/notification-preference-catalog';
import { definePrivateSetting } from '../registry/define-setting';
import { SettingsError } from '../settings.error';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition, SettingValue } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

/** Paket 2.2 (N7): defaults and ranges. */
export const notificationPreferenceSettingDefaults = {
  lockedInApp: 'ticket.approval,ticket.assigned',
  lockedEmail: 'ticket.approval,ticket.sla',
  digestTypes: '',
  digestDefaultTime: '07:30',
  digestMaxItems: { min: 10, max: 200, default: 50 },
  quietBypass: 'ticket.sla',
} as const;

const timePattern = /^([01]\d|2[0-3]):(00|15|30|45)$/;

/** CSV of catalogue category keys; an unknown key is rejected at write time. */
function categoryCsv(label: string) {
  return (value: SettingValue): void => {
    if (typeof value !== 'string') {
      throw new SettingsError(`${label} must be a comma-separated list`);
    }
    const unknown = value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !configurablePreferenceCategoryKeys.includes(part));
    if (unknown.length > 0) {
      throw new SettingsError(
        `${label}: unknown notification categories ${unknown.join(', ')} (allowed: ${configurablePreferenceCategoryKeys.join(', ')})`,
      );
    }
  };
}

const d = notificationPreferenceSettingDefaults;
const category = settingCategoryIds.privateNotifications;

export const notificationPreferenceSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateNotificationsPreferencesEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Users may change their personal notification preferences; off = everyone gets the defaults',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsLockedInAppTypesCsv,
    categoryId: category,
    valueType: 'string',
    description: 'Notification categories users cannot turn off in the application (comma-separated)',
    isRequired: false,
    defaultValue: d.lockedInApp,
    assertValue: categoryCsv('Locked in-app categories'),
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsLockedEmailTypesCsv,
    categoryId: category,
    valueType: 'string',
    description: 'Notification categories whose e-mail users cannot turn off or delay (comma-separated)',
    isRequired: false,
    defaultValue: d.lockedEmail,
    assertValue: categoryCsv('Locked e-mail categories'),
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsDefaultsDigestTypesCsv,
    categoryId: category,
    valueType: 'string',
    description: 'Categories whose default e-mail mode is the daily digest; empty = immediate for all',
    isRequired: false,
    defaultValue: d.digestTypes,
    assertValue: categoryCsv('Default digest categories'),
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsDigestEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Daily digest available; off = digest choices are delivered immediately',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsDigestDefaultTime,
    categoryId: category,
    valueType: 'string',
    description: 'Default digest time (HH:MM, 15-minute steps, installation time zone)',
    isRequired: true,
    defaultValue: d.digestDefaultTime,
    assertValue: (value) => {
      if (typeof value !== 'string' || !timePattern.test(value)) {
        throw new SettingsError('Digest time must be HH:MM in 15-minute steps');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsDigestMaxItems,
    categoryId: category,
    valueType: 'number',
    description: 'Maximum tickets listed in one digest e-mail (10-200)',
    isRequired: true,
    defaultValue: d.digestMaxItems.default,
    assertValue: (value) => {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < d.digestMaxItems.min ||
        value > d.digestMaxItems.max
      ) {
        throw new SettingsError('Digest max items must be an integer between 10 and 200');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsQuietHoursEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Users may set quiet hours (e-mails are held and sent as one summary afterwards)',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateNotificationsQuietHoursBypassTypesCsv,
    categoryId: category,
    valueType: 'string',
    description: 'Categories e-mailed even during quiet hours (comma-separated)',
    isRequired: false,
    defaultValue: d.quietBypass,
    assertValue: categoryCsv('Quiet hours bypass categories'),
  }),
];
