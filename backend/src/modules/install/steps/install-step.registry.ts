import { addonSettingKey, installAddonCatalog } from '../../settings/addon-catalog';
import {
  installStepSavedKeys,
  installStepSkippedKeys,
  settingKeys,
  type InstallSavedStepKey,
} from '../../settings/setting-keys';
import { resolveInstallSectionStepKey } from '../sections/install-settings-section.keys';
import { installSettingsSections } from '../sections/install-settings-section.registry';
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
    key: 'blueprint',
    order: 56,
    // F4.2 (overview §4): the catalog from a template is „O“ from Standard on —
    // Minimum keeps the one service the seed step created.
    requiredIn: ['standard', 'full'],
    offeredIn: ['standard', 'full'],
    skippable: true,
    resettableSettingKeys: [settingKeys.privateInstallBlueprint],
  },
  {
    key: 'policyPack',
    order: 57,
    // F4.3: the IT Standard pack grants the roles the package promises; a
    // deferred pack would leave the installation without those permissions.
    requiredIn: ['standard', 'full'],
    offeredIn: ['standard', 'full'],
    skippable: false,
    // Grants, service policy and audit entries are real configuration — a package
    // change never erases them; only the marker that says the wizard applied the
    // pack is bookkeeping.
    resettableSettingKeys: [settingKeys.privateInstallPolicyPack],
  },
  {
    key: 'slaReview',
    order: 58,
    // F4.4: „K“ in overview §4 — the seeded default is confirmed or adjusted,
    // and the step may be deferred like SMTP and the team step.
    requiredIn: [],
    offeredIn: ['standard', 'full'],
    skippable: true,
    // The business hours and the priority matrix stay as they are — only the
    // marker that the review was answered is dropped.
    resettableSettingKeys: [settingKeys.privateInstallSlaReview],
  },
  // F5: the Full package's content. `install-settings-section.keys.ts` owns the
  // list; one step per section keeps „Podesi kasnije“ a per-section answer instead
  // of an all-or-nothing one, and the step key is derived (`section.<sectionKey>`)
  // so the registry, the markers and the i18n keys cannot drift.
  ...installSettingsSections.map((section, index): InstallStepDefinition => ({
    key: resolveInstallSectionStepKey(section.sectionKey),
    order: 61 + index,
    // Offered, not required: an installation that switches e-mail ingestion on
    // later is not incomplete, it simply did not answer the section.
    requiredIn: [],
    offeredIn: ['full'],
    skippable: true,
    // Answering a section only writes the section's own keys plus the marker;
    // dropping the step from the package drops the marker, never the settings.
    resettableSettingKeys: [
      resolveInstallStepSavedKey(resolveInstallSectionStepKey(section.sectionKey)),
    ],
  })),
  {
    key: 'securityRecommendations',
    order: 72,
    // Owner decision 7: „Primijeni preporuke za produkciju“ is part of Standard
    // and Full — the values themselves live in the recommendations service.
    requiredIn: [],
    offeredIn: ['standard', 'full'],
    skippable: true,
    resettableSettingKeys: [resolveInstallStepSavedKey('securityRecommendations')],
  },
  {
    key: 'addons',
    order: 80,
    requiredIn: allProfiles,
    offeredIn: allProfiles,
    skippable: true,
    // Flags only: falling back to the catalog defaults is harmless.
    resettableSettingKeys: installAddonCatalog.map((item) => addonSettingKey(item.key)),
  },
];

export const installStepDefinitionByKey: Readonly<Record<InstallStepKey, InstallStepDefinition>> =
  Object.fromEntries(
    installStepDefinitions.map((definition) => [definition.key, definition]),
  ) as Record<InstallStepKey, InstallStepDefinition>;

export function listInstallStepDefinitions(): readonly InstallStepDefinition[] {
  return [...installStepDefinitions].sort((left, right) => left.order - right.order);
}

export function resolveInstallStepSkippedKey(stepKey: InstallStepKey): string {
  return installStepSkippedKeys[stepKey];
}

/**
 * F5: the „answered“ marker of a step. Only the steps that have one accept this
 * call — the type is the list of markers, so a step without a saved flag cannot
 * ask for one by accident.
 */
export function resolveInstallStepSavedKey(stepKey: InstallSavedStepKey): string {
  return installStepSavedKeys[stepKey];
}

export function isInstallSavedStepKey(value: string): value is InstallSavedStepKey {
  return Object.prototype.hasOwnProperty.call(installStepSavedKeys, value);
}

export function stepIsIncludedInProfile(stepKey: InstallStepKey, profile: InstallProfile): boolean {
  return isStepIncludedInProfile(installStepDefinitionByKey[stepKey], profile);
}
