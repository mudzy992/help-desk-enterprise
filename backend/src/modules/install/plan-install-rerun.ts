import {
  installStepSavedKeys,
  installStepSkippedKeys,
  settingKeys,
} from '../settings/setting-keys';
import { getSettingDefaultValue } from '../settings/settings-value';
import type { SettingDefinition, SettingsRegistry, SettingValue } from '../settings/settings.types';

/**
 * Owner decision 6: what the ops rerun returns to the registry default, and with
 * which value. The plan is shared by `POST /install/restart` and the
 * `cli:install-rerun` script, so both clear exactly the same keys.
 *
 * `completionKeys` is the lock itself — clearing them reopens the wizard without
 * touching a single answered step. `stepMarkerKeys` are the flags the wizard
 * wrote; clearing them makes the marker-driven steps (the package, the content
 * steps of Standard/Full, the sections and the add-ons) ask again, while a step
 * whose state is read from real rows (SuperAdmin, identity, sign-in mode, SMTP,
 * initial data, team) stays done — a truly empty flow needs an empty database,
 * which is what the F6 Playwright project does.
 */
const completionKeys: readonly string[] = [
  settingKeys.privateInstallCompletedAt,
  settingKeys.privateInstallCompletedByUserId,
];

const stepMarkerKeys: readonly string[] = [
  settingKeys.privateInstallProfile,
  settingKeys.privateInstallBlueprint,
  settingKeys.privateInstallPolicyPack,
  settingKeys.privateInstallSlaReview,
  ...Object.values(installStepSavedKeys),
  ...Object.values(installStepSkippedKeys),
];

export type InstallRerunClear = {
  readonly definition: SettingDefinition;
  readonly value: SettingValue;
};

export function resolveInstallRerunKeys(
  input: { readonly includeStepMarkers?: boolean } = {},
): readonly string[] {
  if (input.includeStepMarkers !== true) {
    return completionKeys;
  }
  return [...new Set([...completionKeys, ...stepMarkerKeys])];
}

/**
 * Only keys that currently carry something other than their default become part
 * of the plan: a key that is already back at its default would only add an empty
 * change-log entry, and a second run of the rerun has to be a no-op.
 *
 * `currentByKey` holds the values as the caller reads them — the API passes the
 * settings service's validated values, the script passes the stored rows — and a
 * key that is absent from it counts as „at its default“.
 */
export function planInstallRerunClears(input: {
  readonly registry: SettingsRegistry;
  readonly currentByKey: ReadonlyMap<string, unknown>;
  readonly includeStepMarkers?: boolean;
}): readonly InstallRerunClear[] {
  const clears: InstallRerunClear[] = [];
  for (const key of resolveInstallRerunKeys(input)) {
    const definition = input.registry.requireDefinition(key);
    const value = getSettingDefaultValue(definition);
    if (value === undefined) {
      throw new Error(`Setting ${key} has no default value to return to`);
    }
    // A key the caller did not read at all is at its default too: the script
    // hands over the stored rows, and an absent row is an unset key.
    const current = input.currentByKey.get(key);
    if (current !== undefined && current !== value) {
      clears.push({ definition, value });
    }
  }
  return clears;
}
