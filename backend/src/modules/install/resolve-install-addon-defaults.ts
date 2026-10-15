import { installAddonCatalog } from '../settings/addon-catalog';
import { installProfilePackages } from './install-profile.catalog';
import {
  installProfileRank,
  type InstallProfile,
} from './steps/install-step.types';

/**
 * Install wizard v2 (F4.5): the package decides which add-ons start switched on
 * („Standard uključuje CSAT, izvještaje …“). Packages are cumulative
 * (`minimum ⊂ standard ⊂ full`), so the answer is the union of the defaults of
 * every package up to the chosen one, falling back to the catalog default for
 * everything no package mentions. The wizard does not own a second list of
 * defaults; this is the one place that reads them.
 */
export function resolveInstallAddonDefaults(
  profile: InstallProfile | null,
): Readonly<Record<string, boolean>> {
  const enabledByPackage = new Set(packageDefaults(profile));
  return Object.fromEntries(
    installAddonCatalog.map((item) => [
      item.key,
      item.defaultEnabled || enabledByPackage.has(item.key),
    ]),
  );
}

function packageDefaults(profile: InstallProfile | null): readonly string[] {
  const upTo = profile === null ? 'minimum' : profile;
  return installProfilePackages
    .filter((entry) => installProfileRank(entry.profile) <= installProfileRank(upTo))
    .flatMap((entry) => entry.defaultEnabledAddons);
}
