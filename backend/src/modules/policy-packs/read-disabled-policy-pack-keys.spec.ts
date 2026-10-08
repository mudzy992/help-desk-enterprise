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
      getSetting: async (key: string) =>
        key === settingKeys.privatePolicyPacksDisabledKeysCsv
          ? value
          : undefined,
      getSecretForInternalUse: async () => undefined,
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
        getSetting: async () => true,
        getSecretForInternalUse: async () => undefined,
      } as unknown as SettingsService),
    ).resolves.toEqual([]);
  });

  // Regression, val 5.3.2 (e2e 41 global setup): the key is a *private*
  // setting, so `getSetting` is the accessor that works; calling the secret one
  // throws `SettingsError`. The reader must not let that escape as a 500.
  it('reads the CSV from a private setting without touching the secret accessor', async () => {
    const secretAccessor = jest.fn(async () => {
      throw new Error('Setting private.policyPacks.disabledKeysCsv is not classified as secret');
    });
    await expect(
      readDisabledPolicyPackKeys({
        getSetting: async () => 'PACK_HR_RESTRICTED',
        getSecretForInternalUse: secretAccessor,
      } as unknown as SettingsService),
    ).resolves.toEqual(['PACK_HR_RESTRICTED']);
    expect(secretAccessor).not.toHaveBeenCalled();
  });

  it('falls back to the secret accessor when the definition is reclassified', async () => {
    await expect(
      readDisabledPolicyPackKeys({
        getSetting: async () => {
          throw new Error('Secret setting must be read via getSecretForInternalUse');
        },
        getSecretForInternalUse: async () => 'pack_finance_restricted',
      } as unknown as SettingsService),
    ).resolves.toEqual(['PACK_FINANCE_RESTRICTED']);
  });

  it('treats an unreadable setting as no restriction instead of failing', async () => {
    await expect(
      readDisabledPolicyPackKeys({
        getSetting: async () => {
          throw new Error('database is unreachable');
        },
        getSecretForInternalUse: async () => {
          throw new Error('database is unreachable');
        },
      } as unknown as SettingsService),
    ).resolves.toEqual([]);
  });
});
