import { ServiceOnboardingError } from '../service-onboarding/service-onboarding.error';
import { PersistedOnboardingRoutingProvider } from '../service-onboarding/persisted-onboarding-routing.provider';
import { buildRoutingConfigurationReference } from './build-routing-configuration-reference';
import { createRoutingServiceHarness } from './create-routing-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('persisted onboarding routing provider', () => {
  it('suggests and validates a routing table reference only after a rule exists', async () => {
    const { routing } = createRoutingServiceHarness();
    const provider = new PersistedOnboardingRoutingProvider(routing);
    expect(await provider.suggest('service-vpn')).toBeNull();
    await expect(
      provider.validate({
        serviceId: 'service-vpn',
        reference: 'group:it-support',
      }),
    ).rejects.toBeInstanceOf(ServiceOnboardingError);
    await routing.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
    });
    const reference = buildRoutingConfigurationReference('service-vpn');
    expect(await provider.suggest('service-vpn')).toBe(reference);
    await expect(
      provider.validate({ serviceId: 'service-vpn', reference }),
    ).resolves.toEqual({
      reference,
      resolvedEntityId: 'service-vpn',
    });
  });
});
