import type { ServiceLifecycle } from '../../generated/prisma/enums';
import {
  areAllOnboardingStepsComplete,
  firstIncompleteStep,
} from './onboarding-step-order';
import { ServiceOnboardingError } from './service-onboarding.error';
import type { ServiceOnboardingRecord } from './service-onboarding.types';

const stepReference: Readonly<
  Record<
    'FORM' | 'ROUTING' | 'SLA' | 'APPROVALS',
    keyof Pick<
      ServiceOnboardingRecord,
      | 'formVersionRef'
      | 'routingConfigurationRef'
      | 'slaConfigurationRef'
      | 'approvalsConfigurationRef'
    >
  >
> = {
  FORM: 'formVersionRef',
  ROUTING: 'routingConfigurationRef',
  SLA: 'slaConfigurationRef',
  APPROVALS: 'approvalsConfigurationRef',
};

export function assertOnboardingConsistency(input: {
  readonly record: ServiceOnboardingRecord;
  readonly serviceLifecycle: ServiceLifecycle;
}): void {
  const { record, serviceLifecycle } = input;
  const expectedCurrent = firstIncompleteStep(record.completedSteps) ?? 'APPROVALS';
  if (record.currentStep !== expectedCurrent) {
    throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
  }
  if (record.status === 'COMPLETED' && serviceLifecycle !== 'ACTIVE') {
    throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
  }
  if (record.status !== 'COMPLETED' && serviceLifecycle === 'ACTIVE') {
    throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
  }
  if (
    record.status === 'READY_FOR_FINALIZATION' &&
    !areAllOnboardingStepsComplete(record.completedSteps)
  ) {
    throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
  }
  for (const [step, field] of Object.entries(stepReference)) {
    if (record.completedSteps.includes(step as 'FORM') && record[field] === null) {
      throw new ServiceOnboardingError('INCONSISTENT_ONBOARDING_STATE');
    }
  }
}

export function assertOnboardingEnabled(enabled: boolean): void {
  if (!enabled) {
    throw new ServiceOnboardingError('DISABLED');
  }
}
