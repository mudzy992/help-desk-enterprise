import { settingKeys } from '../setting-keys';
import { opsSettings, parseEmailCsv } from './ops-settings';

const definition = (key: string) => opsSettings.find((entry) => entry.key === key)! as (typeof opsSettings)[number] & { defaultValue?: unknown };

describe('ops settings (paket 2.7)', () => {
  it('validates the extra recipient list', () => {
    const assert = definition(settingKeys.privateOpsAlertsExtraRecipientsCsv).assertValue!;
    expect(() => assert('')).not.toThrow();
    expect(() => assert('it@epbih.ba, dezurni@epbih.ba')).not.toThrow();
    expect(() => assert('it@epbih.ba, nije-adresa')).toThrow('Invalid e-mail address: nije-adresa');
    expect(parseEmailCsv(' A@x.ba ,, b@y.ba ')).toEqual(['a@x.ba', 'b@y.ba']);
  });

  it('accepts only an https Teams webhook and keeps it secret', () => {
    const teams = definition(settingKeys.privateOpsAlertsTeamsWebhookUrl);
    expect(teams.visibility).toBe('secret');
    expect(() => teams.assertValue!('')).not.toThrow();
    expect(() => teams.assertValue!('https://prod.westeurope.logic.azure.com/workflows/abc')).not.toThrow();
    expect(() => teams.assertValue!('http://example.com')).toThrow('https://');
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
