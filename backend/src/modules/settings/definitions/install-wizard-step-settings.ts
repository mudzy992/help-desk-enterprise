import {
  installSettingsSectionKeys,
  resolveInstallSectionStepKey,
  type InstallSettingsSectionKey,
} from '../../install/sections/install-settings-section.keys';
import { settingCategoryIds } from '../setting-categories';
import { installStepSavedKeys, installStepSkippedKeys } from '../setting-keys';
import { definePrivateSetting } from '../registry/define-setting';
import type { SettingDefinition } from '../settings.types';

/**
 * F5: the two markers of every Full-package section and of the
 * security-recommendations step. English labels are for the descriptions below
 * (developer-facing metadata); the wizard's own copy lives under
 * `install.section.<sectionKey>.*` in bs and en.
 */
const sectionLabels: Readonly<Record<InstallSettingsSectionKey, string>> = {
  inboundEmail: 'Inbound e-mail',
  directory: 'Directory (AD/LDAPS)',
  knowledgeBase: 'Knowledge base',
  statusPage: 'Status page',
  onCall: 'On-call',
  announcements: 'Announcements',
  security: 'Security',
  privacy: 'Privacy and data',
  auditWebhook: 'Audit webhook',
  itsm: 'ITSM modules',
  integrations: 'Integrations',
};

const sectionStepSettings: readonly SettingDefinition[] = installSettingsSectionKeys.flatMap(
  (sectionKey) => {
    const label = sectionLabels[sectionKey];
    const stepKey = resolveInstallSectionStepKey(sectionKey);
    return [
      definePrivateSetting({
        key: installStepSkippedKeys[stepKey],
        categoryId: settingCategoryIds.privateInstall,
        valueType: 'boolean',
        description: `Full package \u201e${label}\u201c section was deferred with "configure later"; the section keeps the registry defaults`,
        isRequired: false,
        defaultValue: false,
        readOnly: true,
      }),
      definePrivateSetting({
        key: installStepSavedKeys[stepKey],
        categoryId: settingCategoryIds.privateInstall,
        valueType: 'boolean',
        description: `Full package \u201e${label}\u201c section was answered in the install wizard; the section's keys may still hold their defaults`,
        isRequired: false,
        defaultValue: false,
        readOnly: true,
      }),
    ];
  },
);

const recommendationStepSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: installStepSkippedKeys.securityRecommendations,
    categoryId: settingCategoryIds.privateInstall,
    valueType: 'boolean',
    description:
      'Security-recommendations step was deferred with "configure later"; the security settings keep their current values',
    isRequired: false,
    defaultValue: false,
    readOnly: true,
  }),
  definePrivateSetting({
    key: installStepSavedKeys.securityRecommendations,
    categoryId: settingCategoryIds.privateInstall,
    valueType: 'boolean',
    description:
      'Security recommendations were reviewed in the install wizard; whether the values were applied is what the security settings themselves say',
    isRequired: false,
    defaultValue: false,
    readOnly: true,
  }),
];

/** F5: every marker this module declares, in the order the wizard offers them. */
export const installSectionStepSettings: readonly SettingDefinition[] = [
  ...sectionStepSettings,
  ...recommendationStepSettings,
];
