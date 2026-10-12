import { settingKeys } from '../settings/setting-keys';
import { OpsConfigurationLoader } from './ops-configuration.loader';

/*
  Package 5.4.0-f follow-up (429 alarm): the loader is the only place where the
  stored thresholds become the numbers the alarm compares against. Two rules
  matter:

    * a missing or unusable value falls back to the default (an operator who
      never opened the settings page still gets a working alarm);
    * the critical level can never end up at or below the warning level — that
      would skip WARNING entirely and turn every alarm red.

  Everything else in this loader is covered indirectly through
  `ops-health.service.spec.ts`; the 429 pair is pinned here.
*/

function loaderWith(values: Readonly<Record<string, unknown>>): OpsConfigurationLoader {
  const settings = {
    getSetting: async (key: string) => values[key] ?? null,
    getSecretForInternalUse: async () => null,
  };
  return new OpsConfigurationLoader(settings as never);
}

describe('OpsConfigurationLoader — 429 thresholds', () => {
  it('uses the plan defaults when nothing is configured', async () => {
    const { thresholds } = await loaderWith({}).load();
    expect(thresholds.login429WarnPerHour).toBe(50);
    expect(thresholds.login429CriticalPerHour).toBe(200);
  });

  it('keeps configured values', async () => {
    const { thresholds } = await loaderWith({
      [settingKeys.privateOpsThresholdsLogin429WarnPerHour]: 120,
      [settingKeys.privateOpsThresholdsLogin429CriticalPerHour]: 900,
    }).load();
    expect(thresholds.login429WarnPerHour).toBe(120);
    expect(thresholds.login429CriticalPerHour).toBe(900);
  });

  it('raises a critical value that would sit at or under the warning level', async () => {
    const { thresholds } = await loaderWith({
      [settingKeys.privateOpsThresholdsLogin429WarnPerHour]: 300,
      [settingKeys.privateOpsThresholdsLogin429CriticalPerHour]: 10,
    }).load();
    expect(thresholds.login429WarnPerHour).toBe(300);
    expect(thresholds.login429CriticalPerHour).toBe(301);
  });

  it('falls back for values the settings layer never stores', async () => {
    const { thresholds } = await loaderWith({
      [settingKeys.privateOpsThresholdsLogin429WarnPerHour]: 'mnogo',
      [settingKeys.privateOpsThresholdsLogin429CriticalPerHour]: 0,
    }).load();
    expect(thresholds.login429WarnPerHour).toBe(50);
    expect(thresholds.login429CriticalPerHour).toBe(200);
  });
});
