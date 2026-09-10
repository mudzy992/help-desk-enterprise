import {
  assertOnboardingIsMutable,
  assertOnboardingStatusTransition,
} from './assert-onboarding-status-transition';
import { ServiceOnboardingError } from './service-onboarding.error';

describe('onboarding status transitions', () => {
  it('allows in-progress to ready, completed, or abandoned', () => {
    expect(() =>
      assertOnboardingStatusTransition({
        from: 'IN_PROGRESS',
        to: 'READY_FOR_FINALIZATION',
      }),
    ).not.toThrow();
    expect(() =>
      assertOnboardingStatusTransition({
        from: 'READY_FOR_FINALIZATION',
        to: 'COMPLETED',
      }),
    ).not.toThrow();
    expect(() =>
      assertOnboardingStatusTransition({
        from: 'ABANDONED',
        to: 'IN_PROGRESS',
      }),
    ).not.toThrow();
  });

  it('rejects completed as a source of any other status', () => {
    expect(() =>
      assertOnboardingStatusTransition({
        from: 'COMPLETED',
        to: 'IN_PROGRESS',
      }),
    ).toThrow(new ServiceOnboardingError('INVALID_STATUS_TRANSITION'));
    expect(() => assertOnboardingIsMutable('COMPLETED')).toThrow(
      new ServiceOnboardingError('INVALID_STATUS_TRANSITION'),
    );
  });
});
