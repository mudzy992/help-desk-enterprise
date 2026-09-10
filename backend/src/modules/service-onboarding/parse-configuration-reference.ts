import { onboardingConfigurationRefMaximumLength } from './service-onboarding.constants';
import { ServiceOnboardingError } from './service-onboarding.error';
import type { ServiceOnboardingErrorCode } from './service-onboarding.error';

const configurationReferencePattern = /^[A-Za-z0-9_.:-]+$/;

export function parseConfigurationReference(
  value: unknown,
  invalidCode: ServiceOnboardingErrorCode,
): string {
  if (typeof value !== 'string') {
    throw new ServiceOnboardingError(invalidCode);
  }
  const reference = value.trim();
  if (
    reference.length === 0 ||
    reference.length > onboardingConfigurationRefMaximumLength ||
    !configurationReferencePattern.test(reference)
  ) {
    throw new ServiceOnboardingError(invalidCode);
  }
  return reference;
}
