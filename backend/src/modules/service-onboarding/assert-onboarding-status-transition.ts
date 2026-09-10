import type { ServiceOnboardingStatus } from '../../generated/prisma/enums';
import { ServiceOnboardingError } from './service-onboarding.error';

const allowed: Readonly<
  Record<ServiceOnboardingStatus, readonly ServiceOnboardingStatus[]>
> = {
  IN_PROGRESS: ['READY_FOR_FINALIZATION', 'ABANDONED', 'COMPLETED'],
  READY_FOR_FINALIZATION: ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'],
  ABANDONED: ['IN_PROGRESS'],
  COMPLETED: [],
};

export function assertOnboardingStatusTransition(input: {
  readonly from: ServiceOnboardingStatus;
  readonly to: ServiceOnboardingStatus;
}): void {
  if (input.from === input.to) {
    return;
  }
  if (!allowed[input.from].includes(input.to)) {
    throw new ServiceOnboardingError('INVALID_STATUS_TRANSITION');
  }
}

export function assertOnboardingIsMutable(
  status: ServiceOnboardingStatus,
): void {
  if (status === 'COMPLETED' || status === 'ABANDONED') {
    throw new ServiceOnboardingError('INVALID_STATUS_TRANSITION');
  }
}
