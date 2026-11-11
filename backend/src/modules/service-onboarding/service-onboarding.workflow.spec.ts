import { BadRequestException } from '@nestjs/common';
import { createServiceOnboardingHarness } from './create-service-onboarding-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('service onboarding workflow', () => {
  const startWizard = async () => {
    const harness = createServiceOnboardingHarness();
    const category = await harness.catalog.createCategory({
      name: 'IT',
      slug: 'it',
    });
    const created = await harness.onboarding.create({
      name: 'VPN access',
      slug: 'vpn-access',
      categoryId: category.id,
    });
    return { harness, created };
  };

  it('starts onboarding for an existing DRAFT service', async () => {
    const harness = createServiceOnboardingHarness();
    const category = await harness.catalog.createCategory({
      name: 'HR',
      slug: 'hr',
    });
    const service = await harness.catalog.create({
      name: 'Leave',
      slug: 'leave',
      categoryId: category.id,
    });
    const started = await harness.onboarding.start(service.id);
    expect(started.serviceId).toBe(service.id);
    expect(started.status).toBe('IN_PROGRESS');
    expect(started.serviceLifecycle).toBe('DRAFT');
  });

  const seedActiveForm = async (
    memory: ReturnType<typeof createServiceOnboardingHarness>['memory'],
    serviceId: string,
    status: 'ACTIVE' | 'DRAFT' = 'ACTIVE',
  ) =>
    memory.seedFormVersion({
      serviceId,
      version: 1,
      schema: { fields: [] },
      status,
    });

  it('creates onboarding for a new DRAFT service at the SERVICE step', async () => {
    const { created } = await startWizard();
    expect(created.status).toBe('IN_PROGRESS');
    expect(created.currentStep).toBe('SERVICE');
    expect(created.completedSteps).toEqual([]);
    expect(created.serviceLifecycle).toBe('DRAFT');
    expect(created.formVersionRef).toBeNull();
  });

  it('saves and completes the service step then advances to FORM', async () => {
    const { harness, created } = await startWizard();
    const saved = await harness.steps.saveServiceStep(created.serviceId, {
      name: 'VPN Access',
    });
    expect(saved.serviceLifecycle).toBe('DRAFT');
    const completed = await harness.steps.completeServiceStep(created.serviceId);
    expect(completed.completedSteps).toEqual(['SERVICE']);
    expect(completed.currentStep).toBe('FORM');
    expect(completed.serviceLifecycle).toBe('DRAFT');
  });

  it('associates an exact formVersionRef and keeps DRAFT form incomplete', async () => {
    const { harness, created } = await startWizard();
    await harness.steps.completeServiceStep(created.serviceId);
    const draft = await seedActiveForm(harness.memory, created.serviceId, 'DRAFT');
    const saved = await harness.steps.saveFormStep(created.serviceId, {
      formVersionRef: draft.id,
    });
    expect(saved.formVersionRef).toBe(draft.id);
    expect(saved.completedSteps).toEqual(['SERVICE']);
    await expect(
      harness.steps.completeFormStep(created.serviceId),
    ).rejects.toBeInstanceOf(BadRequestException);
    const resumed = await harness.onboarding.getByServiceId(created.serviceId);
    expect(resumed.formVersionRef).toBe(draft.id);
    expect(resumed.status).toBe('IN_PROGRESS');
    expect(resumed.serviceLifecycle).toBe('DRAFT');
  });

  it('resumes abandoned incomplete onboarding without activating the service', async () => {
    const { harness, created } = await startWizard();
    await harness.steps.completeServiceStep(created.serviceId);
    const abandoned = await harness.onboarding.abandon(created.serviceId);
    expect(abandoned.status).toBe('ABANDONED');
    expect(abandoned.serviceLifecycle).toBe('DRAFT');
    const resumed = await harness.onboarding.resume(created.serviceId);
    expect(resumed.status).toBe('IN_PROGRESS');
    expect(resumed.completedSteps).toEqual(['SERVICE']);
    expect(resumed.serviceLifecycle).toBe('DRAFT');
  });

  it('finalizes only after every step and then publishes ACTIVE', async () => {
    const { harness, created } = await startWizard();
    await harness.steps.completeServiceStep(created.serviceId);
    const form = await seedActiveForm(harness.memory, created.serviceId);
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
    const ready = await harness.steps.completeApprovalsStep(created.serviceId);
    expect(ready.status).toBe('READY_FOR_FINALIZATION');
    expect(ready.serviceLifecycle).toBe('DRAFT');
    const finalized = await harness.onboarding.finalize(created.serviceId);
    expect(finalized.status).toBe('COMPLETED');
    expect(finalized.serviceLifecycle).toBe('ACTIVE');
    expect(finalized.formVersionRef).toBe(form.id);
    expect(finalized.routingConfigurationRef).toBe('routing-table:vpn');
    expect(finalized.slaConfigurationRef).toBe('sla-standard');
    expect(finalized.approvalsConfigurationRef).toBe('not_required');
    const service = await harness.catalog.getById(created.serviceId);
    expect(service.lifecycle).toBe('ACTIVE');
    expect(service.slaProfileId).toBe('sla-standard');
    expect(service.requiresApproval).toBe(false);
  });
});
