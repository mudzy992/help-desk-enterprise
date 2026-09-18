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
    expect(evaluation).toEqual({ hasCoverage: false, requireCoverage: true });
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

  it('returns null when a routing rule exists', async () => {
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
    const service = new RoutingService(memory.prisma as never, {
      load: async () => ({
        ...defaultRoutingConfiguration,
        requireCoverage: true,
      }),
    } as never);
    await expect(
      service.evaluateActivationCoverage('service-vpn'),
    ).rejects.toMatchObject({ code: 'ROUTING_COVERAGE_MISSING' });
  });

  it('returns warning when not required', async () => {
    const { memory } = createRoutingServiceHarness();
    const service = new RoutingService(memory.prisma as never, {
      load: async () => ({
        ...defaultRoutingConfiguration,
        requireCoverage: false,
      }),
    } as never);
    await expect(service.evaluateActivationCoverage('service-vpn')).resolves.toBe(
      'ROUTING_COVERAGE_MISSING',
    );
  });
});
