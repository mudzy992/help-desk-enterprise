import { changeDefaults } from '../settings/definitions/change-settings';
import { changeConfigurationBounds, clampChangeInteger } from './change-configuration-bounds';

describe('change configuration bounds (W7.77)', () => {
  it('mirrors the setting definitions, so the two ends cannot drift apart', () => {
    // The numbers the settings layer accepts; changing one has to be a decision, not an accident of one side being
    // edited alone.
    expect(changeConfigurationBounds).toEqual({
      normalQuorum: { min: 1, max: 20 },
      emergencyQuorum: { min: 1, max: 20 },
      minLeadTimeHours: { min: 0, max: 720 },
      reminderHoursBeforeStart: { min: 0, max: 168 },
    });
  });

  it('keeps a value that is already inside the range', () => {
    const reminder = changeConfigurationBounds.reminderHoursBeforeStart;
    for (const value of [0, 1, 24, 168]) expect(clampChangeInteger(value, reminder, 24)).toBe(value);
    expect(clampChangeInteger(5, changeConfigurationBounds.normalQuorum, 2)).toBe(5);
    expect(clampChangeInteger(720, changeConfigurationBounds.minLeadTimeHours, 0)).toBe(720);
  });

  it('clamps above and below instead of trusting the stored number', () => {
    const lead = changeConfigurationBounds.minLeadTimeHours;
    expect(clampChangeInteger(1_000_000, lead, 0)).toBe(720);
    expect(clampChangeInteger(-48, lead, 0)).toBe(0);
    expect(clampChangeInteger(Number.MAX_SAFE_INTEGER, lead, 0)).toBe(720);
    expect(clampChangeInteger(-2, changeConfigurationBounds.normalQuorum, 2)).toBe(1);
    expect(clampChangeInteger(1_000, changeConfigurationBounds.normalQuorum, 2)).toBe(20);
  });

  it('falls back for anything that is not an integer, and keeps the fallback in range', () => {
    const reminder = changeConfigurationBounds.reminderHoursBeforeStart;
    for (const value of [undefined, null, '24', 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clampChangeInteger(value, reminder, 24)).toBe(24);
    }
    // A default that escapes the bounds cannot escape them either.
    expect(clampChangeInteger(undefined, reminder, 10_000)).toBe(168);
    expect(clampChangeInteger(undefined, reminder, -5)).toBe(0);
  });

  it('agrees with the defaults the module ships with', () => {
    for (const key of ['normalQuorum', 'emergencyQuorum', 'minLeadTimeHours', 'reminderHoursBeforeStart'] as const) {
      expect(clampChangeInteger(changeDefaults[key], changeConfigurationBounds[key], changeDefaults[key])).toBe(
        changeDefaults[key],
      );
    }
  });
});
