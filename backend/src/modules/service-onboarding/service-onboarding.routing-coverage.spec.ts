import { BadRequestException } from '@nestjs/common';
import { RoutingError } from '../routing/routing.error';
import { createServiceOnboardingHarness } from './create-service-onboarding-harness';
import type { ServiceRoutingCoverageEvaluation } from '../routing/evaluate-service-routing-coverage';
import { DefaultOnboardingRoutingProvider } from './default-onboarding-routing.provider';
import type { ServiceOnboardingRoutingProvider } from './service-onboarding.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const requiredCoverageEvaluation: ServiceRoutingCoverageEvaluation = {
  hasCoverage: false,
  requireCoverage: true,
  requiredOriginUnitCount: 3,
  missingOriginUnitIds: ['ou-child'],
};

class CoverageRoutingProvider
  extends DefaultOnboardingRoutingProvider
  implements ServiceOnboardingRoutingProvider
{
  constructor(
    private readonly coverageResult:
      | ServiceRoutingCoverageEvaluation
      | 'throw'
      | null,
  ) {
    super();
  }

  override async evaluateActivationCoverage(
    _serviceId: string,
  ): Promise<ServiceRoutingCoverageEvaluation | null> {
    if (this.coverageResult === 'throw') {
      throw new RoutingError(
        'ROUTING_COVERAGE_MISSING',
        'ROUTING_COVERAGE_MISSING',
        { routingCoverage: requiredCoverageEvaluation },
      );
    }
    return this.coverageResult;
  }
}

class ToggleCoverageValidationProvider extends DefaultOnboardingRoutingProvider {
  private coverageEvaluation: ServiceRoutingCoverageEvaluation | null = null;

  setCoverageEvaluation(evaluation: ServiceRoutingCoverageEvaluation): void {
    this.coverageEvaluation = evaluation;
  }

  override async validate(input: {
    readonly serviceId: string;
    readonly reference: string;
  }) {
    const validated = await super.validate(input);
    if (this.coverageEvaluation !== null) {
      throw new RoutingError(
        'ROUTING_COVERAGE_MISSING',
        'ROUTING_COVERAGE_MISSING',
        { routingCoverage: this.coverageEvaluation },
      );
    }
    return validated;
  }
}

describe('service onboarding finalize routing coverage', () => {
  const completeThroughApprovals = async (
    coverageResult: ServiceRoutingCoverageEvaluation | 'throw' | null,
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
      response: {
        code: 'ROUTING_COVERAGE_MISSING',
        details: { routingCoverage: requiredCoverageEvaluation },
      },
    });
  });

  it('returns and persists the structured missing set when step coverage changes', async () => {
    const provider = new ToggleCoverageValidationProvider();
    const harness = createServiceOnboardingHarness(undefined, provider);
    const category = await harness.catalog.createCategory({
      name: 'IT',
      slug: 'it',
    });
    const created = await harness.onboarding.create({
      name: 'VPN access',
      slug: 'vpn-access-coverage-validation',
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

    provider.setCoverageEvaluation(requiredCoverageEvaluation);
    await expect(
      harness.steps.completeRoutingStep(created.serviceId),
    ).rejects.toMatchObject({
      response: {
        code: 'ROUTING_COVERAGE_MISSING',
        details: { routingCoverage: requiredCoverageEvaluation },
      },
    });
    await expect(
      harness.onboarding.getByServiceId(created.serviceId),
    ).resolves.toMatchObject({
      lastValidationErrors: [
        {
          code: 'ROUTING_COVERAGE_MISSING',
          step: 'ROUTING',
          details: { routingCoverage: requiredCoverageEvaluation },
        },
      ],
    });
  });

  it('finalizes with warning and coverage audit evidence when the override is active', async () => {
    const coverageEvaluation: ServiceRoutingCoverageEvaluation = {
      hasCoverage: false,
      requireCoverage: false,
      requiredOriginUnitCount: 3,
      missingOriginUnitIds: ['ou-child'],
    };
    const { harness, serviceId } =
      await completeThroughApprovals(coverageEvaluation);
    const finalized = await harness.onboarding.finalize(serviceId);
    expect(finalized.status).toBe('COMPLETED');
    expect(finalized.serviceLifecycle).toBe('ACTIVE');
    expect(finalized.warnings).toEqual(['ROUTING_COVERAGE_MISSING']);
    const lifecycleChangeLogs = harness.memory.catalog.changeLogs.filter(
      (changeLog) => changeLog.reason === 'lifecycle_transition',
    );
    expect(lifecycleChangeLogs[lifecycleChangeLogs.length - 1]).toMatchObject({
      diff: {
        routingCoverage: {
          policySettingKey: 'private.ticket.routing.requireCoverage',
          requireCoverage: false,
          hasCoverage: false,
          requiredOriginUnitCount: 3,
          missingOriginUnitIds: ['ou-child'],
          overrideApplied: true,
        },
      },
    });
  });
});
