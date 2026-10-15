import { addonSettingKey, installAddonCatalog } from '../settings/addon-catalog';
import type { SettingsService } from '../settings/settings.service';

/**
 * Install wizard v2 (F0.5): the add-ons step used to report `completed: true`
 * unconditionally, so a refresh after the seed skipped straight past it and the
 * catalog defaults were never confirmed. The step counts as done only once the
 * operator (or the E2E helper) has saved the catalog at least once — which is
 * exactly what a stored `private.addons.*` row proves. No extra bookkeeping key.
 */
export async function hasSavedInstallAddons(
  settingsService: SettingsService,
): Promise<boolean> {
  for (const item of installAddonCatalog) {
    if (await settingsService.hasStoredValue(addonSettingKey(item.key))) {
      return true;
    }
  }
  return false;
}
