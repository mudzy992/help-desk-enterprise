import { RoutingError } from './routing.error';
import {
  assertOrWarnActivationRoutingCoverage,
  evaluateServiceRoutingCoverage,
} from './evaluate-service-routing-coverage';
import { createRoutingServiceHarness, routingChangeReason } from './create-routing-service-harness';
import { defaultRoutingConfiguration } from './routing.constants';
import { RoutingService } from './routing.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('evaluateServiceRoutingCoverage', () => {
  it('blocks when requireCoverage is true and no rules exist', async () => {
    const { memory } = createRoutingServiceHarness();
    const evaluation = await evaluateServiceRoutingCoverage(
      memory.prisma as never,
      'service-vpn',
      { ...defaultRoutingConfiguration, requireCoverage: true },
    );
    expect(evaluation).toEqual({
      hasCoverage: false,
      requireCoverage: true,
      requiredOriginUnitCount: 3,
      missingOriginUnitIds: ['ou-root', 'ou-child', 'ou-leaf'],
    });
    expect(() => assertOrWarnActivationRoutingCoverage(evaluation)).toThrow(
      RoutingError,
    );
  });

  it('warns when requireCoverage is false and no rules exist', async () => {
    const { memory } = createRoutingServiceHarness();
    const evaluation = await evaluateServiceRoutingCoverage(
      memory.prisma as never,
      'service-vpn',
      { ...defaultRoutingConfiguration, requireCoverage: false },
    );
    expect(assertOrWarnActivationRoutingCoverage(evaluation)).toBe(
      'ROUTING_COVERAGE_MISSING',
    );
  });

  it('does not treat one leaf rule as complete service coverage', async () => {
    const { memory, routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });

    const evaluation = await evaluateServiceRoutingCoverage(
      memory.prisma as never,
      'service-vpn',
      { ...defaultRoutingConfiguration, requireCoverage: true },
    );

    expect(evaluation).toMatchObject({
      hasCoverage: false,
      requiredOriginUnitCount: 3,
      missingOriginUnitIds: ['ou-root', 'ou-child'],
    });
    expect(() => assertOrWarnActivationRoutingCoverage(evaluation)).toThrow(
      RoutingError,
    );
  });

  it('requires coverage for every independent OU tree', async () => {
    const { memory, routing } = createRoutingServiceHarness();
    memory.seedUnit({
      id: 'ou-independent',
      parentId: null,
      ouPath: '/Partneri',
    });
    await routing.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });

    const evaluation = await evaluateServiceRoutingCoverage(
      memory.prisma as never,
      'service-vpn',
      defaultRoutingConfiguration,
    );

    expect(evaluation).toMatchObject({
      hasCoverage: false,
      requiredOriginUnitCount: 4,
      missingOriginUnitIds: ['ou-independent'],
    });
  });

  it('returns null when an ancestor rule covers every origin unit', async () => {
    const { memory, routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
      reason: routingChangeReason,
    });
    const evaluation = await evaluateServiceRoutingCoverage(
      memory.prisma as never,
      'service-vpn',
      defaultRoutingConfiguration,
    );
    expect(evaluation.hasCoverage).toBe(true);
    expect(assertOrWarnActivationRoutingCoverage(evaluation)).toBeNull();
  });
});

describe('RoutingService.evaluateActivationCoverage', () => {
  it('throws ROUTING_COVERAGE_MISSING when required', async () => {
    const { memory } = createRoutingServiceHarness();
    const service = new RoutingService(
      memory.prisma as never,
      {
        load: async () => ({
          ...defaultRoutingConfiguration,
          requireCoverage: true,
        }),
        loadUnroutedTargetGroupId: async () => null,
      } as never,
      { loadBySubjectId: async () => null } as never,
    );
    await expect(
      service.evaluateActivationCoverage('service-vpn'),
    ).rejects.toMatchObject({ code: 'ROUTING_COVERAGE_MISSING' });
  });

  it('returns warning when not required', async () => {
    const { memory } = createRoutingServiceHarness();
    const service = new RoutingService(
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
    await expect(service.evaluateActivationCoverage('service-vpn')).resolves.toBe(
      'ROUTING_COVERAGE_MISSING',
    );
  });
});
