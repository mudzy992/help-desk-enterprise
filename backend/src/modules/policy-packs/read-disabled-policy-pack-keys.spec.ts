import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import { readDisabledPolicyPackKeys } from './read-disabled-policy-pack-keys';

/**
 * M5 B2 (val 5): the CSV is written by hand in the settings drawer, so it must
 * tolerate spacing, lower case and duplicates.
 */
describe('readDisabledPolicyPackKeys (M5 B2)', () => {
  const stubs = (value: string | undefined): SettingsService =>
    ({
      getSecretForInternalUse: async (key: string) =>
        key === settingKeys.privatePolicyPacksDisabledKeysCsv
          ? value
          : undefined,
    }) as unknown as SettingsService;

  it('returns nothing without a settings service', async () => {
    await expect(readDisabledPolicyPackKeys(undefined)).resolves.toEqual([]);
  });

  it('normalises the CSV value', async () => {
    await expect(
      readDisabledPolicyPackKeys(
        stubs(' pack_hr_restricted , PACK_FINANCE_RESTRICTED,pack_hr_restricted '),
      ),
    ).resolves.toEqual(['PACK_FINANCE_RESTRICTED', 'PACK_HR_RESTRICTED']);
  });

  it('treats a blank value as no restriction', async () => {
    await expect(readDisabledPolicyPackKeys(stubs('   '))).resolves.toEqual([]);
  });

  it('ignores a value of an unexpected type', async () => {
    await expect(
      readDisabledPolicyPackKeys({
        getSecretForInternalUse: async () => true,
      } as unknown as SettingsService),
    ).resolves.toEqual([]);
  });
});
