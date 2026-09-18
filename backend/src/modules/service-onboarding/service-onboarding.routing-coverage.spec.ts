import { BadRequestException } from '@nestjs/common';
import { RoutingError } from '../routing/routing.error';
import { createServiceOnboardingHarness } from './create-service-onboarding-harness';
import { DefaultOnboardingRoutingProvider } from './default-onboarding-routing.provider';
import type { ServiceOnboardingRoutingProvider } from './service-onboarding.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

class CoverageRoutingProvider
  extends DefaultOnboardingRoutingProvider
  implements ServiceOnboardingRoutingProvider
{
  constructor(
    private readonly coverageResult:
      | 'ROUTING_COVERAGE_MISSING'
      | 'throw'
      | null,
  ) {
    super();
  }

  override async evaluateActivationCoverage(
    _serviceId: string,
  ): Promise<'ROUTING_COVERAGE_MISSING' | null> {
    if (this.coverageResult === 'throw') {
      throw new RoutingError('ROUTING_COVERAGE_MISSING');
    }
    return this.coverageResult;
  }
}

describe('service onboarding finalize routing coverage', () => {
  const completeThroughApprovals = async (
    coverageResult: 'ROUTING_COVERAGE_MISSING' | 'throw' | null,
  ) => {
    const harness = createServiceOnboardingHarness(
      undefined,
      new CoverageRoutingProvider(coverageResult),
    );
    const category = await harness.catalog.createCategory({
      name: 'IT',
      slug: 'it',
    });
    const created = await harness.onboarding.create({
      name: 'VPN access',
      slug: 'vpn-access',
      categoryId: category.id,
    });
    await harness.steps.completeServiceStep(created.serviceId);
    const form = await harness.memory.seedFormVersion({
      serviceId: created.serviceId,
      version: 1,
      schema: { fields: [] },
      status: 'ACTIVE',
    });
    await harness.steps.saveFormStep(created.serviceId, {
      formVersionRef: form.id,
    });
    await harness.steps.completeFormStep(created.serviceId);
    await harness.steps.saveRoutingStep(created.serviceId, {
      routingConfigurationRef: 'routing-table:vpn',
    });
    await harness.steps.completeRoutingStep(created.serviceId);
    harness.memory.seedSlaProfile('sla-standard');
    await harness.steps.saveSlaStep(created.serviceId, {
      slaConfigurationRef: 'sla-standard',
    });
    await harness.steps.completeSlaStep(created.serviceId);
    await harness.steps.saveApprovalsStep(created.serviceId, {
      approvalsConfigurationRef: 'not_required',
    });
    await harness.steps.completeApprovalsStep(created.serviceId);
    return { harness, serviceId: created.serviceId };
  };

  it('blocks finalize when coverage evaluation throws', async () => {
    const { harness, serviceId } = await completeThroughApprovals('throw');
    await expect(harness.onboarding.finalize(serviceId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(harness.onboarding.finalize(serviceId)).rejects.toMatchObject({
      response: { code: 'ROUTING_COVERAGE_MISSING' },
    });
  });

  it('finalizes with warning when coverage is optional and missing', async () => {
    const { harness, serviceId } =
      await completeThroughApprovals('ROUTING_COVERAGE_MISSING');
    const finalized = await harness.onboarding.finalize(serviceId);
    expect(finalized.status).toBe('COMPLETED');
    expect(finalized.serviceLifecycle).toBe('ACTIVE');
    expect(finalized.warnings).toEqual(['ROUTING_COVERAGE_MISSING']);
  });
});
