import { PrismaService } from '../../common/prisma/prisma.service';
import { updateService } from '../service-catalog/update-service';
import { loadFormVersionForService } from '../service-catalog/load-form-version';
import { loadMutableOnboarding } from './load-mutable-onboarding';
import { assertStepIsReachable } from './onboarding-step-order';
import { persistOnboardingRecord } from './persist-onboarding-record';
import {
  onboardingReasons,
  recordOnboardingChange,
} from './record-onboarding-change';
import { ServiceOnboardingError } from './service-onboarding.error';
import type {
  OnboardingMutationContext,
  SaveOnboardingFormStepInput,
  SaveOnboardingServiceStepInput,
  ServiceOnboardingConfiguration,
  ServiceOnboardingRecord,
} from './service-onboarding.types';

export async function saveOnboardingServiceStep(
  prisma: PrismaService,
  serviceId: string,
  input: SaveOnboardingServiceStepInput,
  configuration: ServiceOnboardingConfiguration,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  const record = await loadMutableOnboarding(prisma, serviceId, configuration);
  assertStepIsReachable(record.completedSteps, 'SERVICE');
  await updateService(prisma, serviceId, input, context);
  await recordOnboardingChange(prisma, {
    entityId: record.id,
    reason: onboardingReasons.saveStep,
    diff: { step: 'SERVICE' },
    actorUserId: context.actorUserId,
  });
  return loadMutableOnboarding(prisma, serviceId, configuration);
}

export async function saveOnboardingFormStep(
  prisma: PrismaService,
  serviceId: string,
  input: SaveOnboardingFormStepInput,
  configuration: ServiceOnboardingConfiguration,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  const record = await loadMutableOnboarding(prisma, serviceId, configuration);
  assertStepIsReachable(record.completedSteps, 'FORM');
  try {
    await loadFormVersionForService(prisma, serviceId, input.formVersionRef);
  } catch {
    throw new ServiceOnboardingError('INVALID_FORM_VERSION_REF');
  }
  const updated = await persistOnboardingRecord(prisma, record, {
    formVersionRef: input.formVersionRef,
    lastValidationErrors: [],
  });
  await recordOnboardingChange(prisma, {
    entityId: record.id,
    reason: onboardingReasons.saveStep,
    diff: { step: 'FORM', formVersionRef: input.formVersionRef },
    actorUserId: context.actorUserId,
  });
  return updated;
}
