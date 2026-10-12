import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { opsSettings, parseEmailCsv } from './ops-settings';

const definition = (key: string) => opsSettings.find((entry) => entry.key === key)! as (typeof opsSettings)[number] & { defaultValue?: unknown };

describe('ops settings (paket 2.7)', () => {
  it('validates the extra recipient list', () => {
    const assert = definition(settingKeys.privateOpsAlertsExtraRecipientsCsv).assertValue!;
    expect(() => assert('')).not.toThrow();
    expect(() => assert('it@example.com, dezurni@example.com')).not.toThrow();
    expect(() => assert('it@example.com, nije-adresa')).toThrow('Invalid e-mail address: nije-adresa');
    expect(parseEmailCsv(' A@x.ba ,, b@y.ba ')).toEqual(['a@x.ba', 'b@y.ba']);
  });

  it('accepts only an https Teams webhook and keeps it secret', () => {
    const teams = definition(settingKeys.privateOpsAlertsTeamsWebhookUrl);
    expect(teams.visibility).toBe('secret');
    expect(() => teams.assertValue!('')).not.toThrow();
    expect(() => teams.assertValue!('https://prod.westeurope.logic.azure.com/workflows/abc')).not.toThrow();
    expect(() => teams.assertValue!('http://example.com')).toThrow('https://');
  });

  it('bounds the 429 alarm thresholds and keeps the plan defaults', () => {
    // Package 5.4.0-f follow-up: the 5.4 plan asks for the alarm to fire on the
    // hourly 429 rate with a default of 50; the critical level sits above it.
    const warn = definition(settingKeys.privateOpsThresholdsLogin429WarnPerHour);
    const critical = definition(settingKeys.privateOpsThresholdsLogin429CriticalPerHour);
    expect(warn.defaultValue).toBe(50);
    expect(critical.defaultValue).toBe(200);
    expect(warn.categoryId).toBe(settingCategoryIds.privateObservability);
    expect(() => warn.assertValue!(0)).toThrow('between 1 and 100000');
    expect(() => warn.assertValue!(20.5)).toThrow('between 1 and 100000');
    expect(() => warn.assertValue!(100001)).toThrow('between 1 and 100000');
    expect(() => warn.assertValue!(1)).not.toThrow();
    expect(() => warn.assertValue!(100000)).not.toThrow();
    expect(() => critical.assertValue!(1)).toThrow('between 2 and 200000');
    expect(() => critical.assertValue!(2)).not.toThrow();
    expect(() => critical.assertValue!(200000)).not.toThrow();
    // The alarm must never be able to fire "critical" below its own warning
    // level: the loader raises the critical value above the warning one.
    expect(critical.defaultValue).toBeGreaterThan(warn.defaultValue as number);
  });

  it('bounds thresholds', () => {
    const disk = definition(settingKeys.privateOpsThresholdsDiskWarnPercent);
    expect(disk.defaultValue).toBe(80);
    expect(() => disk.assertValue!(49)).toThrow();
    expect(() => disk.assertValue!(80.5)).toThrow();
    expect(() => disk.assertValue!(85)).not.toThrow();
    expect(definition(settingKeys.privateStatusPagePublic).defaultValue).toBe(false);
  });
});
