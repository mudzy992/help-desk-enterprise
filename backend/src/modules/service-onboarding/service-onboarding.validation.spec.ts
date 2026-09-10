import { BadRequestException } from '@nestjs/common';
import { createServiceOnboardingHarness } from './create-service-onboarding-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

async function expectOnboardingCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual(
      expect.objectContaining({ code }),
    );
  }
}

describe('service onboarding validation', () => {
  const startWizard = async () => {
    const harness = createServiceOnboardingHarness();
    const category = await harness.catalog.createCategory({
      name: 'IT',
      slug: 'it',
    });
    const created = await harness.onboarding.create({
      name: 'Access',
      slug: 'access',
      categoryId: category.id,
    });
    return { harness, created };
  };

  it('rejects completing FORM before SERVICE', async () => {
    const { harness, created } = await startWizard();
    await expectOnboardingCode(
      harness.steps.completeFormStep(created.serviceId),
      'INVALID_STEP_TRANSITION',
    );
  });

  it('rejects form complete without an ACTIVE formVersionRef', async () => {
    const { harness, created } = await startWizard();
    await harness.steps.completeServiceStep(created.serviceId);
    await expect(
      harness.steps.completeFormStep(created.serviceId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates routing, SLA, and approvals configuration references', async () => {
    const { harness, created } = await startWizard();
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
    await expectOnboardingCode(
      harness.steps.saveRoutingStep(created.serviceId, {
        routingConfigurationRef: 'bad ref',
      }),
      'INVALID_ROUTING_CONFIGURATION_REF',
    );
    await harness.steps.saveRoutingStep(created.serviceId, {
      routingConfigurationRef: 'group:it-support',
    });
    await harness.steps.completeRoutingStep(created.serviceId);
    await harness.steps.saveSlaStep(created.serviceId, {
      slaConfigurationRef: 'sla-opaque-profile',
    });
    await harness.steps.completeSlaStep(created.serviceId);
    await expectOnboardingCode(
      harness.steps.saveApprovalsStep(created.serviceId, {
        approvalsConfigurationRef: 'not required',
      }),
      'INVALID_APPROVALS_CONFIGURATION_REF',
    );
    const saved = await harness.steps.saveApprovalsStep(created.serviceId, {
      approvalsConfigurationRef: 'approval-flow:access',
    });
    expect(saved.routingConfigurationRef).toBe('group:it-support');
    expect(saved.slaConfigurationRef).toBe('sla-opaque-profile');
    expect(saved.approvalsConfigurationRef).toBe('approval-flow:access');
  });

  it('rejects finalize until every prerequisite is valid and keeps DRAFT', async () => {
    const { harness, created } = await startWizard();
    await expectOnboardingCode(
      harness.onboarding.finalize(created.serviceId),
      'FINAL_VALIDATION_FAILED',
    );
    const current = await harness.onboarding.getByServiceId(created.serviceId);
    expect(current.status).toBe('IN_PROGRESS');
    expect(current.serviceLifecycle).toBe('DRAFT');
    expect(current.lastValidationErrors.length).toBeGreaterThan(0);
  });

  it('rejects inconsistent COMPLETED + DRAFT state', async () => {
    const { harness, created } = await startWizard();
    harness.memory.seedOnboarding({
      id: created.id,
      serviceId: created.serviceId,
      status: 'COMPLETED',
      currentStep: 'APPROVALS',
      formVersionRef: null,
      routingConfigurationRef: 'r1',
      slaConfigurationRef: 's1',
      approvalsConfigurationRef: 'a1',
      completedSteps: ['SERVICE', 'FORM', 'ROUTING', 'SLA', 'APPROVALS'],
      lastValidationErrors: null,
      createdAt: new Date('2026-09-10T10:00:00.000Z'),
      updatedAt: new Date('2026-09-10T10:00:00.000Z'),
    });
    await expectOnboardingCode(
      harness.onboarding.getByServiceId(created.serviceId),
      'INCONSISTENT_ONBOARDING_STATE',
    );
  });
});
