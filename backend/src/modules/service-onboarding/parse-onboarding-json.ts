import type { ServiceOnboardingStep } from '../../generated/prisma/enums';
import { isOnboardingStep } from './onboarding-step-order';
import { ServiceOnboardingError } from './service-onboarding.error';
import type { ServiceOnboardingValidationIssue } from './service-onboarding.types';

export function parseCompletedSteps(
  value: unknown,
): readonly ServiceOnboardingStep[] {
  if (!Array.isArray(value)) {
    throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
  }
  const steps: ServiceOnboardingStep[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !isOnboardingStep(item) || seen.has(item)) {
      throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
    }
    seen.add(item);
    steps.push(item);
  }
  return steps;
}

export function parseValidationIssues(
  value: unknown,
): readonly ServiceOnboardingValidationIssue[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
  }
  return value.map((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { code?: unknown }).code !== 'string'
    ) {
      throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
    }
    const code = (item as { code: string }).code;
    const step = (item as { step?: unknown }).step;
    if (step !== undefined && (typeof step !== 'string' || !isOnboardingStep(step))) {
      throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
    }
    return {
      code,
      ...(typeof step === 'string' ? { step } : {}),
    };
  });
}
