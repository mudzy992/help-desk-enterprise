import type { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { sortPolicyPackTokens } from './sort-policy-pack-tokens';

/**
 * M5 B2 (val 5): the packs themselves stay in code, but an installation can
 * switch individual packs off with `private.policyPacks.disabledKeysCsv`.
 * Keys are compared case-insensitively because admins type them by hand.
 */
export async function readDisabledPolicyPackKeys(
  settingsService: SettingsService | undefined,
): Promise<readonly string[]> {
  if (settingsService === undefined) {
    // The in-memory test world and any caller without settings see no
    // restrictions — the same behaviour as an empty CSV.
    return [];
  }
  const value = await settingsService.getSecretForInternalUse(
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
