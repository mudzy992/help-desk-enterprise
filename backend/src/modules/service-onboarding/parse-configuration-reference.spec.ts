import { parseConfigurationReference } from './parse-configuration-reference';
import { ServiceOnboardingError } from './service-onboarding.error';

describe('parseConfigurationReference', () => {
  it('accepts opaque routing/SLA/approvals refs', () => {
    expect(
      parseConfigurationReference(
        'routing-table:vpn',
        'INVALID_ROUTING_CONFIGURATION_REF',
      ),
    ).toBe('routing-table:vpn');
  });

  it('rejects blank or spaced references', () => {
    expect(() =>
      parseConfigurationReference('  ', 'INVALID_SLA_CONFIGURATION_REF'),
    ).toThrow(new ServiceOnboardingError('INVALID_SLA_CONFIGURATION_REF'));
    expect(() =>
      parseConfigurationReference(
        'not required',
        'INVALID_APPROVALS_CONFIGURATION_REF',
      ),
    ).toThrow(
      new ServiceOnboardingError('INVALID_APPROVALS_CONFIGURATION_REF'),
    );
  });
});
