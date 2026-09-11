import {
  addonRequiresSmtp,
  installAddonCatalog,
  type InstallAddonKey,
} from '../settings/addon-catalog';
import { resolveEmailAddonEnabled } from '../settings/resolve-email-addon-enabled';

export function resolveInstallAddonsState(input: {
  readonly smtpEnabled: boolean;
  readonly stored: Readonly<Partial<Record<InstallAddonKey, boolean>>>;
  readonly requested: Readonly<Partial<Record<InstallAddonKey, boolean>>>;
}): Readonly<Record<InstallAddonKey, boolean>> {
  const resolved = {} as Record<InstallAddonKey, boolean>;
  for (const item of installAddonCatalog) {
    const requested = input.requested[item.key];
    const stored = input.stored[item.key];
    const enabled =
      typeof requested === 'boolean'
        ? requested
        : typeof stored === 'boolean'
          ? stored
          : item.defaultEnabled;
    resolved[item.key] = addonRequiresSmtp(item)
      ? resolveEmailAddonEnabled({
          smtpEnabled: input.smtpEnabled,
          emailAddonEnabled: enabled,
        })
      : enabled;
  }
  return resolved;
}
