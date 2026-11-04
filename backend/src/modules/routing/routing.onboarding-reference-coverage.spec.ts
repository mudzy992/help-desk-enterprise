import { PersistedOnboardingRoutingProvider } from '../service-onboarding/persisted-onboarding-routing.provider';
import { createRoutingServiceHarness, routingChangeReason } from './create-routing-service-harness';
import { defaultRoutingConfiguration } from './routing.constants';
import { RoutingService } from './routing.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('persisted onboarding routing coverage', () => {
  it('does not suggest or accept a reference when a required OU is missing', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const provider = new PersistedOnboardingRoutingProvider(routing);

    await expect(provider.suggest('service-vpn')).resolves.toBeNull();
    await expect(
      provider.validate({
        serviceId: 'service-vpn',
        reference: 'routing:service-vpn',
      }),
    ).rejects.toMatchObject({
      code: 'ROUTING_COVERAGE_MISSING',
      details: {
        routingCoverage: {
          hasCoverage: false,
          requireCoverage: true,
          requiredOriginUnitCount: 3,
          missingOriginUnitIds: ['ou-root', 'ou-child'],
        },
      },
    });
  });

  it('accepts and suggests an ancestor rule that resolves every required OU', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const provider = new PersistedOnboardingRoutingProvider(routing);

    await expect(provider.suggest('service-vpn')).resolves.toBe(
      'routing:service-vpn',
    );
    await expect(
      provider.validate({
        serviceId: 'service-vpn',
        reference: 'routing:service-vpn',
      }),
    ).resolves.toEqual({
      reference: 'routing:service-vpn',
      resolvedEntityId: 'service-vpn',
    });
  });

  it('allows incomplete coverage only with the explicit non-required policy', async () => {
    const { memory, routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const optionalRouting = new RoutingService(
      memory.prisma as never,
      {
        load: async () => ({
          ...defaultRoutingConfiguration,
          requireCoverage: false,
        }),
        loadUnroutedTargetGroupId: async () => null,
      } as never,
      { loadBySubjectId: async () => null } as never,
    );
    const provider = new PersistedOnboardingRoutingProvider(optionalRouting);

    await expect(provider.suggest('service-vpn')).resolves.toBe(
      'routing:service-vpn',
    );
    await expect(
      provider.validate({
        serviceId: 'service-vpn',
        reference: 'routing:service-vpn',
      }),
    ).resolves.toMatchObject({ resolvedEntityId: 'service-vpn' });
    await expect(provider.evaluateActivationCoverage('service-vpn')).resolves.toEqual({
      hasCoverage: false,
      requireCoverage: false,
      requiredOriginUnitCount: 3,
      missingOriginUnitIds: ['ou-root', 'ou-child'],
    });
  });
});
