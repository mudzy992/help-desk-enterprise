import type { ServiceOnboardingStep } from "@/services/service-onboarding-api";
import { SERVICE_ONBOARDING_STEPS } from "@/services/service-onboarding-api";

export function onboardingStepIndex(step: ServiceOnboardingStep): number {
  return SERVICE_ONBOARDING_STEPS.indexOf(step);
}

export function completedOnboardingCount(
  completedSteps: readonly ServiceOnboardingStep[],
): number {
  return SERVICE_ONBOARDING_STEPS.filter((step) =>
    completedSteps.includes(step),
  ).length;
}

export function isOnboardingStepComplete(
  completedSteps: readonly ServiceOnboardingStep[],
  step: ServiceOnboardingStep,
): boolean {
  return completedSteps.includes(step);
}

export function canReachOnboardingStep(
  completedSteps: readonly ServiceOnboardingStep[],
  step: ServiceOnboardingStep,
): boolean {
  const index = onboardingStepIndex(step);
  return SERVICE_ONBOARDING_STEPS.slice(0, index).every((previous) =>
    completedSteps.includes(previous),
  );
}
