import { settingCategoryIds } from '../setting-categories';
import { installStepSkippedKeys, settingKeys } from '../setting-keys';
import { definePrivateSetting } from '../registry/define-setting';
import { installSectionStepSettings } from './install-wizard-step-settings';
import type { SettingDefinition } from '../settings.types';

/**
 * Install wizard v2 (F1): what the wizard needs on top of
 * `private.install.completedAt` / `completedByUserId`. Every key here is
 * `readOnly` (IN18) — the wizard writes them through `POST /install/*`.
 *
 * Both key families live under the environment-bound `private.install.` prefix,
 * so they never travel through a configuration package — an exported package must
 * not carry one installation's package choice.
 */
const skippedStepSettings: readonly {
  readonly key: string;
  readonly description: string;
}[] = [
  {
    key: installStepSkippedKeys.profile,
    description:
      'Package step was deferred with "configure later"; the choice stays on the post-install checklist',
  },
  {
    key: installStepSkippedKeys.superAdmin,
    description:
      'Super admin step is not offered for deferral: without the account nobody can sign in',
  },
  {
    key: installStepSkippedKeys.identity,
    description:
      'Identity step is not offered for deferral: without the organisation name the installation stays anonymous',
  },
  {
    key: installStepSkippedKeys.loginProvider,
    description:
      'Sign-in mode step was deferred with "configure later"; the local break-glass login stays active',
  },
  {
    key: installStepSkippedKeys.smtp,
    description:
      'SMTP step was deferred with "configure later"; without it e-mail notifications stay off',
  },
  {
    key: installStepSkippedKeys.seed,
    description:
      'Initial data step is not offered for deferral: without it the system cannot receive tickets',
  },
  {
    key: installStepSkippedKeys.team,
    description:
      'Team step was deferred with "configure later"; the founder remains the only member of the handler group',
  },
  {
    key: installStepSkippedKeys.blueprint,
    description:
      'Catalog-from-template step was deferred with "configure later"; the catalog keeps only the service from the seed step',
  },
  {
    key: installStepSkippedKeys.policyPack,
    description:
      'Policy pack step is not offered for deferral: the pack carries the role permissions the package promises',
  },
  {
    key: installStepSkippedKeys.slaReview,
    description:
      'SLA review step was deferred with "configure later"; the seeded business hours and priority matrix stay as they are',
  },
  {
    key: installStepSkippedKeys.addons,
    description:
      'Add-ons step was deferred with "configure later"; the catalog defaults stay in place',
  },
];

export const installWizardSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateInstallProfile,
    categoryId: settingCategoryIds.privateInstall,
    valueType: 'string',
    description:
      'Package chosen in the install wizard (minimum, standard or full); empty means no package was chosen yet and the wizard behaves like the old minimum flow',
    isRequired: false,
    allowedValues: ['', 'minimum', 'standard', 'full'],
    defaultValue: '',
    // IN18: the package is chosen in the wizard; a hand edit here would fight
    // the step registry the wizard derives its flow from.
    readOnly: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateInstallBlueprint,
    categoryId: settingCategoryIds.privateInstall,
    valueType: 'string',
    description:
      'Blueprint applied by the catalog step (for example itServiceDesk); empty means the catalog was not built from a template',
    isRequired: false,
    defaultValue: '',
    // IN18: the catalog step writes it; a hand edit would only misdescribe the
    // services that already exist.
    readOnly: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateInstallPolicyPack,
    categoryId: settingCategoryIds.privateInstall,
    valueType: 'string',
    description:
      'Policy pack applied by the wizard to the organizational unit (for example itStandard); empty means no pack was applied from the wizard',
    isRequired: false,
    defaultValue: '',
    readOnly: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateInstallSlaReview,
    categoryId: settingCategoryIds.privateInstall,
    valueType: 'string',
    description:
      'How the SLA review step ended: confirmed (defaults accepted) or adjusted (business hours or the priority matrix were changed); empty means the step was not answered yet',
    isRequired: false,
    allowedValues: ['', 'confirmed', 'adjusted'],
    defaultValue: '',
    readOnly: true,
  }),
  ...installSectionStepSettings,
  ...skippedStepSettings.map((entry) =>
    definePrivateSetting({
      key: entry.key,
      categoryId: settingCategoryIds.privateInstall,
      valueType: 'boolean',
      description: entry.description,
      isRequired: false,
      defaultValue: false,
      // IN18: only "Podesi kasnije" writes these flags.
      readOnly: true,
    }),
  ),
];
