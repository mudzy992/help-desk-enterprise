import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from '../service-catalog/load-service';
import { loadMutableOnboarding } from './load-mutable-onboarding';
import { assertStepIsReachable } from './onboarding-step-order';
import { persistOnboardingRecord } from './persist-onboarding-record';
import {
  onboardingReasons,
  recordOnboardingChange,
} from './record-onboarding-change';
import type {
  OnboardingMutationContext,
  SaveOnboardingApprovalsStepInput,
  SaveOnboardingRoutingStepInput,
  SaveOnboardingSlaStepInput,
  ServiceOnboardingConfiguration,
  ServiceOnboardingRecord,
} from './service-onboarding.types';
import type { OnboardingDomainProviders } from './validate-onboarding-steps';

export async function saveOnboardingRoutingStep(
  prisma: PrismaService,
  serviceId: string,
  input: SaveOnboardingRoutingStepInput,
  configuration: ServiceOnboardingConfiguration,
  providers: OnboardingDomainProviders,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  const record = await loadMutableOnboarding(prisma, serviceId, configuration);
  assertStepIsReachable(record.completedSteps, 'ROUTING');
  const validated = await providers.routing.validate({
    serviceId,
    reference: input.routingConfigurationRef,
  });
  const updated = await persistOnboardingRecord(prisma, record, {
    routingConfigurationRef: validated.reference,
    lastValidationErrors: [],
  });
  await recordOnboardingChange(prisma, {
    entityId: record.id,
    reason: onboardingReasons.saveStep,
    diff: { step: 'ROUTING', routingConfigurationRef: validated.reference },
    actorUserId: context.actorUserId,
  });
  return updated;
}

export async function saveOnboardingSlaStep(
  prisma: PrismaService,
  serviceId: string,
  input: SaveOnboardingSlaStepInput,
  configuration: ServiceOnboardingConfiguration,
  providers: OnboardingDomainProviders,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  const record = await loadMutableOnboarding(prisma, serviceId, configuration);
  assertStepIsReachable(record.completedSteps, 'SLA');
  const validated = await providers.sla.validate({
    serviceId,
    reference: input.slaConfigurationRef,
  });
  const updated = await persistOnboardingRecord(prisma, record, {
    slaConfigurationRef: validated.reference,
    lastValidationErrors: [],
  });
  await recordOnboardingChange(prisma, {
    entityId: record.id,
    reason: onboardingReasons.saveStep,
    diff: { step: 'SLA', slaConfigurationRef: validated.reference },
    actorUserId: context.actorUserId,
  });
  return updated;
}

export async function saveOnboardingApprovalsStep(
  prisma: PrismaService,
  serviceId: string,
  input: SaveOnboardingApprovalsStepInput,
  configuration: ServiceOnboardingConfiguration,
  providers: OnboardingDomainProviders,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  const record = await loadMutableOnboarding(prisma, serviceId, configuration);
  assertStepIsReachable(record.completedSteps, 'APPROVALS');
  const service = await loadService(prisma, serviceId);
  const validated = await providers.approvals.validate({
    serviceId,
    reference: input.approvalsConfigurationRef,
    requiresApproval: service.requiresApproval,
  });
  const updated = await persistOnboardingRecord(prisma, record, {
    approvalsConfigurationRef: validated.reference,
    lastValidationErrors: [],
  });
  await recordOnboardingChange(prisma, {
    entityId: record.id,
    reason: onboardingReasons.saveStep,
    diff: { step: 'APPROVALS', approvalsConfigurationRef: validated.reference },
    actorUserId: context.actorUserId,
  });
  return updated;
}
