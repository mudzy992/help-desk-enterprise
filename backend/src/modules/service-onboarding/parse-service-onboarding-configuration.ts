import { settingKeys } from '../settings/setting-keys';
import { ServiceOnboardingError } from './service-onboarding.error';
import type { ServiceOnboardingConfiguration } from './service-onboarding.types';

export function parseServiceOnboardingConfiguration(input: {
  readonly enabled: unknown;
  readonly requireValidationBeforeActivate: unknown;
  readonly autoFillRoutingEnabled: unknown;
  readonly autoFillRoutingRequireConfirm: unknown;
}): ServiceOnboardingConfiguration {
  if (
    typeof input.enabled !== 'boolean' ||
    typeof input.requireValidationBeforeActivate !== 'boolean' ||
    typeof input.autoFillRoutingEnabled !== 'boolean' ||
    typeof input.autoFillRoutingRequireConfirm !== 'boolean'
  ) {
    throw new ServiceOnboardingError('UNAVAILABLE');
  }
  return {
    enabled: input.enabled,
    requireValidationBeforeActivate: input.requireValidationBeforeActivate,
    autoFillRoutingEnabled: input.autoFillRoutingEnabled,
    autoFillRoutingRequireConfirm: input.autoFillRoutingRequireConfirm,
  };
}

export const onboardingSettingKeys = {
  enabled: settingKeys.privateServicesOnboardingWizardEnabled,
  requireValidationBeforeActivate:
    settingKeys.privateServicesOnboardingWizardRequireValidationBeforeActivate,
  autoFillRoutingEnabled:
    settingKeys.privateServicesOnboardingWizardAutoFillRoutingEnabled,
  autoFillRoutingRequireConfirm:
    settingKeys.privateServicesOnboardingWizardAutoFillRoutingRequireConfirm,
} as const;
