import { definePrivateSetting } from '../registry/define-setting';
import { SettingsError } from '../settings.error';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition, SettingValue } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

/** Package 1.3 (T1): defaults and ranges of the time tracking guard. */
export const timeTrackingSettingRanges = {
  idleAutoPauseMinutes: { min: 0, max: 120, default: 10 },
  maxSessionHours: { min: 1, max: 24, default: 8 },
  maxBackdateDays: { min: 1, max: 31, default: 7 },
  manualMaxMinutes: { min: 1, max: 1440, default: 720 },
} as const;

function integerInRange(label: string, range: { min: number; max: number }) {
  return (value: SettingValue): void => {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < range.min ||
      value > range.max
    ) {
      throw new SettingsError(
        `${label} must be an integer between ${range.min} and ${range.max}`,
      );
    }
  };
}

const r = timeTrackingSettingRanges;

export const timeTrackingSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateTimeTrackingIdleAutoPauseMinutes,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description:
      'Pause a running timer after this many minutes of inactivity (hidden tab or no input); 0 disables (0-120)',
    isRequired: true,
    defaultValue: r.idleAutoPauseMinutes.default,
    assertValue: integerInRange('Idle auto-pause minutes', r.idleAutoPauseMinutes),
  }),
  definePrivateSetting({
    key: settingKeys.privateTimeTrackingAutoResume,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Resume the timer automatically (as a new segment) when the agent comes back',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTimeTrackingMaxSessionHours,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Hard limit of one timer segment in hours; longer timers are stopped automatically (1-24)',
    isRequired: true,
    defaultValue: r.maxSessionHours.default,
    assertValue: integerInRange('Max session hours', r.maxSessionHours),
  }),
  definePrivateSetting({
    key: settingKeys.privateTimeTrackingSingleActivePerUser,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Allow only one running timer per user across all tickets',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTimeTrackingManualEntryEnabled,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'boolean',
    description: 'Allow agents to add past time manually (with a note)',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateTimeTrackingManualEntryMaxBackdateDays,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'How many days back own time may be added or corrected (1-31)',
    isRequired: true,
    defaultValue: r.maxBackdateDays.default,
    assertValue: integerInRange('Max backdate days', r.maxBackdateDays),
  }),
  definePrivateSetting({
    key: settingKeys.privateTimeTrackingManualEntryMaxMinutes,
    categoryId: settingCategoryIds.privateTicket,
    valueType: 'number',
    description: 'Longest single manual time entry in minutes (1-1440)',
    isRequired: true,
    defaultValue: r.manualMaxMinutes.default,
    assertValue: integerInRange('Manual entry max minutes', r.manualMaxMinutes),
  }),
];
