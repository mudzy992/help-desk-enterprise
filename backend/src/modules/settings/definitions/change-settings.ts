import { definePrivateSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition } from '../settings.types';

/**
 * Paket 3.4: change management defaults, also used when a value is missing.
 * The module itself is switched on by the `private.addons.changes` addon.
 */
export const changeDefaults = {
  numberPrefix: 'CHG-',
  normalQuorum: 2,
  emergencyQuorum: 1,
  minLeadTimeHours: 0,
  requireTestPlan: false,
  freezePeriods: '[]',
  reminderHoursBeforeStart: 24,
} as const;

/** A change freeze: calendar days `from`..`to` inclusive (YYYY-MM-DD). */
export type ChangeFreezePeriod = { readonly from: string; readonly to: string; readonly label: string };

const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const freezeMax = 50;

function isValidDay(value: string): boolean {
  if (!isoDay.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** JSON text -> freeze periods sorted by start; invalid input -> null. */
export function parseFreezePeriods(value: unknown): ChangeFreezePeriod[] | null {
  if (typeof value !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.trim().length === 0 ? '[]' : value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > freezeMax) return null;
  const periods: ChangeFreezePeriod[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { from, to, label } = entry as Record<string, unknown>;
    if (typeof from !== 'string' || typeof to !== 'string' || !isValidDay(from) || !isValidDay(to) || from > to) return null;
    if (label !== undefined && (typeof label !== 'string' || label.length > 100)) return null;
    periods.push({ from, to, label: typeof label === 'string' ? label.trim() : '' });
  }
  return periods.sort((left, right) => left.from.localeCompare(right.from));
}

function integerIn(min: number, max: number, message: string) {
  return (value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new SettingsError(message);
    }
  };
}

const category = settingCategoryIds.privateChanges;

export const changeSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateChangesNumberPrefix,
    categoryId: category,
    valueType: 'string',
    description: 'Prefix of change numbers (letters, digits or -; at most 8), e.g. CHG-000042',
    isRequired: true,
    defaultValue: changeDefaults.numberPrefix,
    assertValue: (value) => {
      if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,8}$/.test(value)) {
        throw new SettingsError('Prefix: 1 to 8 letters, digits or -');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateChangesNormalQuorum,
    categoryId: category,
    valueType: 'number',
    description: 'CAB approvals needed for a normal change (capped by the number of eligible members)',
    isRequired: true,
    defaultValue: changeDefaults.normalQuorum,
    assertValue: integerIn(1, 20, 'Quorum must be an integer between 1 and 20'),
  }),
  definePrivateSetting({
    key: settingKeys.privateChangesEmergencyQuorum,
    categoryId: category,
    valueType: 'number',
    description: 'CAB approvals needed for an emergency change (capped by the number of eligible members)',
    isRequired: true,
    defaultValue: changeDefaults.emergencyQuorum,
    assertValue: integerIn(1, 20, 'Quorum must be an integer between 1 and 20'),
  }),
  definePrivateSetting({
    key: settingKeys.privateChangesMinLeadTimeHours,
    categoryId: category,
    valueType: 'number',
    description: 'Minimum hours between sending a normal change to the CAB and its planned start (0 = off)',
    isRequired: true,
    defaultValue: changeDefaults.minLeadTimeHours,
    assertValue: integerIn(0, 720, 'Lead time must be an integer between 0 and 720 hours'),
  }),
  definePrivateSetting({
    key: settingKeys.privateChangesRequireTestPlan,
    categoryId: category,
    valueType: 'boolean',
    description: 'A test plan is required before a change goes to the CAB (off by default)',
    isRequired: true,
    defaultValue: changeDefaults.requireTestPlan,
  }),
  definePrivateSetting({
    key: settingKeys.privateChangesFreezePeriods,
    categoryId: category,
    valueType: 'string',
    description: 'Change freeze periods as JSON: [{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","label":"..."}]; emergency changes are allowed',
    isRequired: false,
    defaultValue: changeDefaults.freezePeriods,
    assertValue: (value) => {
      if (parseFreezePeriods(value) === null) {
        throw new SettingsError(`Freeze periods: a JSON list of at most ${freezeMax} {from, to, label} with valid dates (from <= to)`);
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateChangesReminderHoursBeforeStart,
    categoryId: category,
    valueType: 'number',
    description: 'Remind the change owner this many hours before the planned start (0 = off)',
    isRequired: true,
    defaultValue: changeDefaults.reminderHoursBeforeStart,
    assertValue: integerIn(0, 168, 'Reminder must be an integer between 0 and 168 hours'),
  }),
];
