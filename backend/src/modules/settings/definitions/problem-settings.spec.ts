import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import {
  clampIntegerSetting,
  problemDefaults,
  problemSettingBounds,
  problemSettings,
} from './problem-settings';

function definition(key: string) {
  const found = problemSettings.find((setting) => setting.key === key);
  if (found === undefined) throw new Error(`missing setting ${key}`);
  return found;
}

function assertValueOf(key: string, value: unknown): void {
  const assertValue = definition(key).assertValue as ((value: unknown) => void) | undefined;
  if (assertValue === undefined) throw new Error(`setting ${key} has no assertValue`);
  assertValue(value);
}

describe('clampIntegerSetting (BA-problems-18)', () => {
  const bounds = problemSettingBounds.bulkResolveMax;

  it('keeps an integer inside the bounds as it is', () => {
    expect(clampIntegerSetting(200, 200, bounds)).toBe(200);
    expect(clampIntegerSetting(bounds.min, 200, bounds)).toBe(bounds.min);
    expect(clampIntegerSetting(bounds.max, 200, bounds)).toBe(bounds.max);
  });

  it('pulls an out-of-band integer to the nearest bound instead of trusting it', () => {
    // The finding: a stored value used to reach the resolver unchanged.
    expect(clampIntegerSetting(100_000, 200, bounds)).toBe(bounds.max);
    expect(clampIntegerSetting(0, 200, bounds)).toBe(bounds.min);
    expect(clampIntegerSetting(-7, 200, bounds)).toBe(bounds.min);
  });

  it('falls back for a value that is not an integer at all', () => {
    expect(clampIntegerSetting('500', 200, bounds)).toBe(200);
    expect(clampIntegerSetting(12.5, 200, bounds)).toBe(200);
    expect(clampIntegerSetting(null, 200, bounds)).toBe(200);
    expect(clampIntegerSetting(Number.NaN, 200, bounds)).toBe(200);
  });

  it('keeps its own defaults inside the declared bounds', () => {
    expect(problemDefaults.bulkResolveMax).toBeGreaterThanOrEqual(problemSettingBounds.bulkResolveMax.min);
    expect(problemDefaults.bulkResolveMax).toBeLessThanOrEqual(problemSettingBounds.bulkResolveMax.max);
    expect(problemDefaults.autoCloseDays).toBeGreaterThanOrEqual(problemSettingBounds.autoCloseDays.min);
    expect(problemDefaults.autoCloseDays).toBeLessThanOrEqual(problemSettingBounds.autoCloseDays.max);
    expect(problemDefaults.targetCriticalWorkingDays).toBeGreaterThanOrEqual(problemSettingBounds.targetWorkingDays.min);
    expect(problemDefaults.targetLowWorkingDays).toBeLessThanOrEqual(problemSettingBounds.targetWorkingDays.max);
  });
});

describe('problem setting write validation shares the read bounds (BA-problems-18)', () => {
  it('refuses the values the reader would have to clamp', () => {
    expect(() => assertValueOf(settingKeys.privateProblemsBulkResolveMax, problemSettingBounds.bulkResolveMax.max + 1)).toThrow(
      SettingsError,
    );
    expect(() => assertValueOf(settingKeys.privateProblemsBulkResolveMax, 0)).toThrow(SettingsError);
    expect(() => assertValueOf(settingKeys.privateProblemsAutoCloseDays, -1)).toThrow(SettingsError);
    expect(() => assertValueOf(settingKeys.privateProblemsAutoCloseDays, 366)).toThrow(SettingsError);
    expect(() => assertValueOf(settingKeys.privateProblemsTargetCriticalWorkingDays, 0)).toThrow(SettingsError);
  });

  it('accepts the bounds themselves', () => {
    expect(() => assertValueOf(settingKeys.privateProblemsBulkResolveMax, problemSettingBounds.bulkResolveMax.min)).not.toThrow();
    expect(() => assertValueOf(settingKeys.privateProblemsBulkResolveMax, problemSettingBounds.bulkResolveMax.max)).not.toThrow();
    expect(() => assertValueOf(settingKeys.privateProblemsAutoCloseDays, 0)).not.toThrow();
    expect(() => assertValueOf(settingKeys.privateProblemsAutoCloseDays, 365)).not.toThrow();
    expect(() => assertValueOf(settingKeys.privateProblemsTargetLowWorkingDays, 365)).not.toThrow();
  });
});
