import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createService } from '../service-catalog/create-service';
import type { ServiceLifecycleConfiguration } from '../service-catalog/service-catalog.types';
import { assertOnboardingEnabled } from './assert-onboarding-consistency';
import {
  onboardingReasons,
  recordOnboardingChange,
} from './record-onboarding-change';
import type {
  CreateServiceOnboardingInput,
  OnboardingMutationContext,
  ServiceOnboardingConfiguration,
  ServiceOnboardingRecord,
} from './service-onboarding.types';
import { toOnboardingRecord } from './to-onboarding-record';

export async function createServiceOnboarding(
  prisma: PrismaService,
  input: CreateServiceOnboardingInput,
  configuration: ServiceOnboardingConfiguration,
  lifecycleConfiguration: ServiceLifecycleConfiguration,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  assertOnboardingEnabled(configuration.enabled);
  const service = await createService(
    prisma,
    input,
    lifecycleConfiguration,
    context,
  );
  const created = await prisma.serviceOnboarding.create({
    data: {
      serviceId: service.id,
      status: 'IN_PROGRESS',
      currentStep: 'SERVICE',
      completedSteps: [] as Prisma.InputJsonValue,
    },
  });
  await recordOnboardingChange(prisma, {
    entityId: created.id,
    reason: onboardingReasons.create,
    diff: { after: { serviceId: service.id, status: created.status } },
    actorUserId: context.actorUserId,
  });
  return toOnboardingRecord(created);
}
