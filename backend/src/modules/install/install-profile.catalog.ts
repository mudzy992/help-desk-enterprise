import type { InstallAddonKey } from '../settings/addon-catalog';
import type { InstallProfile, InstallStepKey } from './steps/install-step.types';

export type InstallProfilePackageItem = {
  /** Stable id; the catalogue line is `install.profile.item.<key>`. */
  readonly key: string;
  readonly labelKey: string;
  readonly required: boolean;
};

export type InstallProfilePackage = {
  readonly profile: InstallProfile;
  readonly titleKey: string;
  readonly descriptionKey: string;
  /** Rough duration of the package for an operator who knows the environment. */
  readonly estimatedMinutes: number;
  readonly recommended: boolean;
  readonly requiredSteps: readonly InstallStepKey[];
  readonly offeredSteps: readonly InstallStepKey[];
  /**
   * Add-ons this package switches on by default. Owner decision 4: CMDB,
   * problems and changes belong to Full by default — F4 turns this metadata into
   * the actual add-on step defaults.
   */
  readonly defaultEnabledAddons: readonly InstallAddonKey[];
  readonly items: readonly InstallProfilePackageItem[];
};

export const installProfileCatalogVersion = 1;

/**
 * Install wizard v2 (F1): the three fixed packages from `00_overview.md` §4
 * (`minimum` ⊂ `standard` ⊂ `full`). The catalogue is data, not behaviour: the
 * wizard reads it through `GET /install/profile`, and F3/F4 render and apply it.
 */
export const installProfilePackages: readonly InstallProfilePackage[] = [
  {
    profile: 'minimum',
    titleKey: 'install.profile.minimum.title',
    descriptionKey: 'install.profile.minimum.description',
    estimatedMinutes: 5,
    recommended: false,
    requiredSteps: ['profile', 'superAdmin', 'identity', 'loginProvider', 'seed', 'addons'],
    offeredSteps: ['smtp'],
    defaultEnabledAddons: [],
    items: [
      item('tokenGate', true),
      item('superAdmin', true),
      item('organizationIdentity', true),
      item('loginMode', true),
      item('structure', true),
      item('firstService', true),
      item('provisioning', true),
      item('readyScreen', true),
      item('branding', false),
    ],
  },
  {
    profile: 'standard',
    titleKey: 'install.profile.standard.title',
    descriptionKey: 'install.profile.standard.description',
    estimatedMinutes: 15,
    recommended: true,
    requiredSteps: [
      'profile',
      'superAdmin',
      'identity',
      'loginProvider',
      'smtp',
      'seed',
      'team',
      'blueprint',
      'policyPack',
      'addons',
    ],
    offeredSteps: ['slaReview'],
    // F4.5: the add-ons Standard turns on when the operator saves the step
    // without changing anything (`email` follows SMTP through `requiresSmtp`).
    defaultEnabledAddons: [
      'csat',
      'approvals',
      'confidential',
      'kbIntercept',
      'savedViews',
      'bulkActions',
      'reports',
    ],
    items: [
      item('team', true),
      item('smtp', true),
      item('emailNotifications', true),
      item('catalogBlueprints', true),
      item('policyPackIt', true),
      item('addonsOverview', true),
      item('handlerLevels', false),
      item('slaOverview', false),
      item('securityRecommendations', false),
    ],
  },
  {
    profile: 'full',
    titleKey: 'install.profile.full.title',
    descriptionKey: 'install.profile.full.description',
    estimatedMinutes: 30,
    recommended: false,
    requiredSteps: [
      'profile',
      'superAdmin',
      'identity',
      'loginProvider',
      'smtp',
      'seed',
      'team',
      'blueprint',
      'policyPack',
      'addons',
    ],
    offeredSteps: ['slaReview'],
    // Owner decision 4: the ITSM modules are on by default in Full.
    defaultEnabledAddons: ['cmdb', 'problems', 'changes'],
    items: [
      item('inboundEmail', false),
      item('directorySync', false),
      item('knowledgeBase', false),
      item('statusPage', false),
      item('onCall', false),
      item('announcements', false),
      item('itsmModules', true),
      item('integrations', false),
      item('privacyRetention', false),
    ],
  },
];

export function findInstallProfilePackage(
  profile: InstallProfile,
): InstallProfilePackage {
  const found = installProfilePackages.find((entry) => entry.profile === profile);
  if (found === undefined) {
    throw new Error(`Unknown install package: ${profile}`);
  }
  return found;
}

export function listInstallProfileItems(
  profile: InstallProfile,
): readonly InstallProfilePackageItem[] {
  return installProfilePackages
    .filter((entry) => rankOf(entry.profile) <= rankOf(profile))
    .flatMap((entry) => entry.items)
    .filter(
      (entry, index, all) =>
        all.findIndex((candidate) => candidate.key === entry.key) === index,
    );
}

function rankOf(profile: InstallProfile): number {
  return ['minimum', 'standard', 'full'].indexOf(profile);
}

function item(key: string, required: boolean): InstallProfilePackageItem {
  return { key, labelKey: `install.profile.item.${key}`, required };
}
