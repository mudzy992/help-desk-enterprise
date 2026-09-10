import type {
  ServiceOnboardingStatus,
  ServiceOnboardingStep,
} from '../../generated/prisma/enums';
import {
  areAllOnboardingStepsComplete,
  firstIncompleteStep,
} from './onboarding-step-order';

export function deriveOnboardingWorkflow(input: {
  readonly status: ServiceOnboardingStatus;
  readonly completedSteps: readonly ServiceOnboardingStep[];
}): {
  readonly status: ServiceOnboardingStatus;
  readonly currentStep: ServiceOnboardingStep;
} {
  const currentStep = firstIncompleteStep(input.completedSteps) ?? 'APPROVALS';
  if (input.status === 'COMPLETED' || input.status === 'ABANDONED') {
    return { status: input.status, currentStep };
  }
  if (areAllOnboardingStepsComplete(input.completedSteps)) {
    return { status: 'READY_FOR_FINALIZATION', currentStep };
  }
  return { status: 'IN_PROGRESS', currentStep };
}
