import type { ServiceOnboardingStep } from '../../generated/prisma/enums';
import { onboardingSteps } from './service-onboarding.constants';
import { ServiceOnboardingError } from './service-onboarding.error';

export function isOnboardingStep(value: string): value is ServiceOnboardingStep {
  return (onboardingSteps as readonly string[]).includes(value);
}

export function stepIndex(step: ServiceOnboardingStep): number {
  return onboardingSteps.indexOf(step);
}

export function nextOnboardingStep(
  step: ServiceOnboardingStep,
): ServiceOnboardingStep | null {
  const next = onboardingSteps[stepIndex(step) + 1];
  return next ?? null;
}

export function firstIncompleteStep(
  completedSteps: readonly ServiceOnboardingStep[],
): ServiceOnboardingStep | null {
  return onboardingSteps.find((step) => !completedSteps.includes(step)) ?? null;
}

export function areAllOnboardingStepsComplete(
  completedSteps: readonly ServiceOnboardingStep[],
): boolean {
  return firstIncompleteStep(completedSteps) === null;
}

export function assertStepIsReachable(
  completedSteps: readonly ServiceOnboardingStep[],
  step: ServiceOnboardingStep,
): void {
  const incomplete = firstIncompleteStep(completedSteps);
  if (incomplete === null || completedSteps.includes(step) || step === incomplete) {
    return;
  }
  if (stepIndex(step) > stepIndex(incomplete)) {
    throw new ServiceOnboardingError('INVALID_STEP_TRANSITION');
  }
}

export function previousStepsOf(
  step: ServiceOnboardingStep,
): readonly ServiceOnboardingStep[] {
  return onboardingSteps.slice(0, stepIndex(step));
}
