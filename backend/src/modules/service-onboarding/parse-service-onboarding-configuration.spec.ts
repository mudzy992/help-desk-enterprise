import { parseServiceOnboardingConfiguration } from './parse-service-onboarding-configuration';
import { ServiceOnboardingError } from './service-onboarding.error';

describe('parseServiceOnboardingConfiguration', () => {
  it('parses the default wizard flags', () => {
    expect(
      parseServiceOnboardingConfiguration({
        enabled: true,
        requireValidationBeforeActivate: true,
        autoFillRoutingEnabled: true,
        autoFillRoutingRequireConfirm: true,
      }),
    ).toEqual({
      enabled: true,
      requireValidationBeforeActivate: true,
      autoFillRoutingEnabled: true,
      autoFillRoutingRequireConfirm: true,
    });
  });

  it('rejects non-boolean configuration', () => {
    expect(() =>
      parseServiceOnboardingConfiguration({
        enabled: 'true',
        requireValidationBeforeActivate: true,
        autoFillRoutingEnabled: true,
        autoFillRoutingRequireConfirm: true,
      }),
    ).toThrow(new ServiceOnboardingError('UNAVAILABLE'));
  });
});
