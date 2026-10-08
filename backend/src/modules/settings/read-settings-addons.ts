import {
  addonRequiresSmtp,
  addonSettingKey,
  installAddonCatalog,
} from './addon-catalog';
import { resolveEmailAddonEnabled } from './resolve-email-addon-enabled';
import { settingKeys } from './setting-keys';
import type { SettingsService } from './settings.service';
import type {
  InstallAddonPublicItem,
  InstallAddonsStatus,
} from '../install/install-addons.types';

/**
 * Paket 5.3.4 (ispravka 2026-10-08): the settings tab shows the addon catalogue
 * with the values this installation actually stored.
 *
 * Why a second read exists at all: `GET /install/addons` is the **public**
 * install-wizard route, and since the 5.2 fix for finding M1 #5 it deliberately
 * answers with the static catalogue defaults once the wizard is completed — an
 * anonymous caller must not be able to infer which addons are switched on.
 * The settings screen kept reading that route, so after installation every
 * switch showed its default: turning an addon on wrote the real setting
 * (`PUT /settings` → 200) while the card still showed "off" on the next load.
 *
 * This read goes through the authenticated settings service, so it is the
 * honest state an administrator has to see. The "SMTP off always wins" rule for
 * the email addon lives in `resolveEmailAddonEnabled` and is applied here as
 * well, because the *effective* state is what the switch must show.
 *
 * **Envelope:** the response is exactly `InstallAddonsStatus` —
 * `{ addons: { smtpEnabled, items } }` — the same shape as `GET /install/addons`,
 * so one frontend parser (`parseAddonCatalogItems`) serves both routes. The
 * first version of this fix returned the record unwrapped and the settings card
 * silently disappeared, because the parser rejected it.
 */
export async function readSettingsAddons(
  settingsService: SettingsService,
): Promise<InstallAddonsStatus> {
  const smtpEnabled =
    (await settingsService.getSetting(settingKeys.privateSmtpEnabled)) === true;
  const items: InstallAddonPublicItem[] = [];
  for (const item of installAddonCatalog) {
    const stored =
      (await settingsService.getSetting(addonSettingKey(item.key))) === true;
    const requiresSmtp = addonRequiresSmtp(item);
    items.push({
      key: item.key,
      enabled: requiresSmtp
        ? resolveEmailAddonEnabled({
            smtpEnabled,
            emailAddonEnabled: stored,
          })
        : stored,
      defaultEnabled: item.defaultEnabled,
      canEnable: requiresSmtp ? smtpEnabled : true,
    });
  }
  return { addons: { smtpEnabled, items } };
}
