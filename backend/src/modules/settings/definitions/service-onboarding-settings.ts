import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const serviceOnboardingSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateServicesOnboardingWizardEnabled,
    categoryId: settingCategoryIds.privateServices,
    valueType: 'boolean',
    description: 'Master switch for the service onboarding wizard',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesOnboardingWizardRequireValidationBeforeActivate,
    categoryId: settingCategoryIds.privateServices,
    valueType: 'boolean',
    description:
      'Block service activation until onboarding final validation succeeds',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesOnboardingWizardAutoFillRoutingEnabled,
    categoryId: settingCategoryIds.privateServices,
    valueType: 'boolean',
    description:
      'Allow the wizard to suggest a routing configuration reference',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateServicesOnboardingWizardAutoFillRoutingRequireConfirm,
    categoryId: settingCategoryIds.privateServices,
    valueType: 'boolean',
    description:
      'Require an admin to persist a routing suggestion; never silent-write',
    isRequired: true,
    defaultValue: true,
  }),
];
