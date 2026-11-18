import { definePrivateSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition } from '../settings.types';

/**
 * Paket 3.3: problem management defaults, also used when a value is missing.
 * The module itself is switched on by the `private.addons.problems` addon.
 */
export const problemDefaults = {
  numberPrefix: 'P-',
  rootCauseCategories: 'hardware,software,network,configuration,process,human,supplier,unknown',
  requireWorkaroundForKnownError: false,
  autoCloseDays: 14,
  bulkResolveMax: 200,
  targetEnabled: false,
  targetCalendarId: '',
  targetCriticalWorkingDays: 2,
  targetHighWorkingDays: 5,
  targetMediumWorkingDays: 10,
  targetLowWorkingDays: 20,
} as const;

/**
 * W7.40 (BA-problems-18): the bounds are declared once, so the writer and the
 * reader cannot drift apart. `assertValue` refuses a value outside them, and
 * `clampIntegerSetting` keeps an out-of-band row (written before validation
 * existed, restored from an old backup, or edited straight in the database)
 * from turning into an unbounded loop in a request or an hourly sweep.
 */
export const problemSettingBounds = {
  /** One bulk action resolves at most this many tickets, sequentially. */
  bulkResolveMax: { min: 1, max: 1000 },
  /** 0 = never close automatically. */
  autoCloseDays: { min: 0, max: 365 },
  targetWorkingDays: { min: 1, max: 365 },
} as const;

export type ProblemSettingBound = { readonly min: number; readonly max: number };

/**
 * The value when it is an integer inside the bounds, the nearest bound when it
 * is an integer outside them, and the fallback when it is not a number at all.
 * Clamping is deliberate: a stored `100000` must not fail the request, it must
 * behave like `1000` and be visible as such in the health card.
 */
export function clampIntegerSetting(value: unknown, fallback: number, bounds: ProblemSettingBound): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

const rootCauseKeyPattern = /^[a-z][a-z0-9-]{1,31}$/;

/** "a,b,c" -> unique keys in order; invalid input -> null. */
export function parseRootCauseCategories(value: unknown): string[] | null {
  if (typeof value !== 'string') return null;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0 || parts.length > 30) return null;
  if (parts.some((part) => !rootCauseKeyPattern.test(part))) return null;
  return [...new Set(parts)];
}

function integerIn(bounds: ProblemSettingBound, message: string) {
  return (value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      throw new SettingsError(message);
    }
  };
}

const category = settingCategoryIds.privateProblems;

function target(key: string, defaultValue: number, label: string): SettingDefinition {
  return definePrivateSetting({
    key,
    categoryId: category,
    valueType: 'number',
    description: `Target resolution time in working days for ${label} problems (used only when targets are on)`,
    isRequired: true,
    defaultValue,
    assertValue: integerIn(problemSettingBounds.targetWorkingDays, 'Target must be an integer between 1 and 365 working days'),
  });
}

export const problemSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateProblemsNumberPrefix,
    categoryId: category,
    valueType: 'string',
    description: 'Prefix of problem numbers (letters, digits or -; at most 8), e.g. P-000042',
    isRequired: true,
    defaultValue: problemDefaults.numberPrefix,
    assertValue: (value) => {
      if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,8}$/.test(value)) {
        throw new SettingsError('Prefix: 1 to 8 letters, digits or -');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateProblemsRootCauseCategories,
    categoryId: category,
    valueType: 'string',
    description: 'Root cause categories as comma-separated keys (lowercase letters, digits, -; at most 30)',
    isRequired: true,
    defaultValue: problemDefaults.rootCauseCategories,
    assertValue: (value) => {
      if (parseRootCauseCategories(value) === null) {
        throw new SettingsError('Root cause categories: 1 to 30 comma-separated keys (a-z, 0-9, -)');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateProblemsRequireWorkaroundForKnownError,
    categoryId: category,
    valueType: 'boolean',
    description: 'A workaround is required to move a problem to Known error (off by default)',
    isRequired: true,
    defaultValue: problemDefaults.requireWorkaroundForKnownError,
  }),
  definePrivateSetting({
    key: settingKeys.privateProblemsBulkResolveMax,
    categoryId: category,
    valueType: 'number',
    description: 'Maximum number of linked tickets resolved by one bulk action',
    isRequired: true,
    defaultValue: problemDefaults.bulkResolveMax,
    assertValue: integerIn(problemSettingBounds.bulkResolveMax, 'Bulk resolve maximum must be an integer between 1 and 1000'),
  }),
  definePrivateSetting({
    key: settingKeys.privateProblemsAutoCloseDays,
    categoryId: category,
    valueType: 'number',
    description: 'Days after which a resolved problem is closed automatically (0 = never)',
    isRequired: true,
    defaultValue: problemDefaults.autoCloseDays,
    assertValue: integerIn(problemSettingBounds.autoCloseDays, 'Auto-close must be an integer between 0 and 365 days'),
  }),
  definePrivateSetting({
    key: settingKeys.privateProblemsTargetEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Set a target resolution date by priority and remind the owner (off by default)',
    isRequired: true,
    defaultValue: problemDefaults.targetEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateProblemsTargetCalendarId,
    categoryId: category,
    valueType: 'string',
    description: 'Business-hours calendar id for problem targets (empty = the default calendar)',
    isRequired: false,
    defaultValue: problemDefaults.targetCalendarId,
    assertValue: (value) => {
      if (typeof value !== 'string' || value.length > 64) throw new SettingsError('Calendar id must be at most 64 characters');
    },
  }),
  target(settingKeys.privateProblemsTargetCriticalWorkingDays, problemDefaults.targetCriticalWorkingDays, 'critical'),
  target(settingKeys.privateProblemsTargetHighWorkingDays, problemDefaults.targetHighWorkingDays, 'high-priority'),
  target(settingKeys.privateProblemsTargetMediumWorkingDays, problemDefaults.targetMediumWorkingDays, 'medium-priority'),
  target(settingKeys.privateProblemsTargetLowWorkingDays, problemDefaults.targetLowWorkingDays, 'low-priority'),
];
