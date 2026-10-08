import type { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { sortPolicyPackTokens } from './sort-policy-pack-tokens';

/**
 * M5 B2 (val 5): the packs themselves stay in code, but an installation can
 * switch individual packs off with `private.policyPacks.disabledKeysCsv`.
 * Keys are compared case-insensitively because admins type them by hand.
 *
 * Val 5.3.2: the definition is a **private** setting, while `getSetting` and
 * `getSecretForInternalUse` each refuse the other visibility — reading a private
 * key through the secret accessor throws `SettingsError`. That throw escaped as
 * `INTERNAL_ERROR` on `POST /users` the first time the users summary needed the
 * disabled keys (e2e global setup, run 2026-10-08). The read is therefore
 * visibility-agnostic and tolerant, and a value that cannot be read at all is
 * treated like the empty CSV it is documented to be.
 */
async function readSettingTolerantly(
  settingsService: SettingsService,
  key: string,
): Promise<unknown> {
  try {
    return await settingsService.getSetting(key);
  } catch {
    try {
      return await settingsService.getSecretForInternalUse(key);
    } catch {
      return undefined;
    }
  }
}

export async function readDisabledPolicyPackKeys(
  settingsService: SettingsService | undefined,
): Promise<readonly string[]> {
  if (settingsService === undefined) {
    // The in-memory test world and any caller without settings see no
    // restrictions — the same behaviour as an empty CSV.
    return [];
  }
  const value = await readSettingTolerantly(
    settingsService,
    settingKeys.privatePolicyPacksDisabledKeysCsv,
  );
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }
  return sortPolicyPackTokens(
    value
      .split(',')
      .map((token) => token.trim().toUpperCase())
      .filter((token) => token.length > 0),
  );
}
