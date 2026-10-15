import { addonSettingKey, installAddonCatalog } from '../../settings/addon-catalog';
import { installStepSkippedKeys } from '../../settings/setting-keys';
import {
  isStepIncludedInProfile,
  type InstallProfile,
  type InstallStepDefinition,
  type InstallStepKey,
} from './install-step.types';

const allProfiles: readonly InstallProfile[] = ['minimum', 'standard', 'full'];

/**
 * Install wizard v2 (F1): one declaration per step. The order matches the old
 * hard-coded chain (`profile` is new in front of it) so existing installations
 * and `e2e/helpers/ensure-install.ts` keep walking the same path.
 *
 * `smtp` is required from Standard on and only offered in Minimum (overview §4),
 * which is why it may be deferred. `superAdmin` and `seed` can never be skipped:
 * without them the installation cannot receive tickets (readiness §3).
 */
export const installStepDefinitions: readonly InstallStepDefinition[] = [
  {
    key: 'profile',
    order: 10,
    requiredIn: allProfiles,
    offeredIn: allProfiles,
    skippable: false,
    // The package key is written by the step itself; clearing it here would
    // erase the choice that is being made.
    resettableSettingKeys: [],
  },
  {
    key: 'superAdmin',
    order: 20,
    requiredIn: allProfiles,
    offeredIn: allProfiles,
    skippable: false,
    resettableSettingKeys: [],
  },
  {
    key: 'identity',
    order: 25,
    requiredIn: allProfiles,
    offeredIn: allProfiles,
    skippable: false,
    // Branding, language and time zone are real configuration of the running
    // installation — a package change never erases them.
    resettableSettingKeys: [],
  },
  {
    key: 'loginProvider',
    order: 30,
    requiredIn: allProfiles,
    offeredIn: allProfiles,
    skippable: false,
    // Break-glass login must survive any package change.
    resettableSettingKeys: [],
  },
  {
    key: 'smtp',
    order: 40,
    requiredIn: ['standard', 'full'],
    offeredIn: allProfiles,
    skippable: true,
    // Credentials and the sender identity are never erased by a package change.
    resettableSettingKeys: [],
  },
  {
    key: 'seed',
    order: 50,
    requiredIn: allProfiles,
    offeredIn: allProfiles,
    skippable: false,
    // OU, group, service and routing records are the installation itself.
    resettableSettingKeys: [],
  },
  {
    key: 'team',
    order: 55,
    // Minimum may run without a team (the founder is the only member); from
    // Standard on the wizard asks for it, but "configure later" is allowed.
    requiredIn: ['standard', 'full'],
    offeredIn: allProfiles,
    skippable: true,
    // People and their memberships survive a package change; only flags may be reset.
    resettableSettingKeys: [],
  },
  {
    key: 'addons',
    order: 60,
    requiredIn: allProfiles,
    offeredIn: allProfiles,
    skippable: true,
    // Flags only: falling back to the catalog defaults is harmless.
    resettableSettingKeys: installAddonCatalog.map((item) =>
      addonSettingKey(item.key),
    ),
  },
];

export const installStepDefinitionByKey: Readonly<
  Record<InstallStepKey, InstallStepDefinition>
> = Object.fromEntries(
  installStepDefinitions.map((definition) => [definition.key, definition]),
) as Record<InstallStepKey, InstallStepDefinition>;

export function listInstallStepDefinitions(): readonly InstallStepDefinition[] {
  return [...installStepDefinitions].sort((left, right) => left.order - right.order);
}

export function resolveInstallStepSkippedKey(stepKey: InstallStepKey): string {
  return installStepSkippedKeys[stepKey];
}

export function stepIsIncludedInProfile(
  stepKey: InstallStepKey,
  profile: InstallProfile,
): boolean {
  return isStepIncludedInProfile(installStepDefinitionByKey[stepKey], profile);
}
