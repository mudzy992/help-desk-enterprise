import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from '../service-catalog/load-service';
import { assertOnboardingEnabled } from './assert-onboarding-consistency';
import {
  onboardingReasons,
  recordOnboardingChange,
} from './record-onboarding-change';
import { ServiceOnboardingError } from './service-onboarding.error';
import type {
  OnboardingMutationContext,
  ServiceOnboardingConfiguration,
  ServiceOnboardingRecord,
} from './service-onboarding.types';
import { toOnboardingRecord } from './to-onboarding-record';

export async function startServiceOnboarding(
  prisma: PrismaService,
  serviceId: string,
  configuration: ServiceOnboardingConfiguration,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  assertOnboardingEnabled(configuration.enabled);
  const service = await loadService(prisma, serviceId);
  if (service.lifecycle !== 'DRAFT') {
    throw new ServiceOnboardingError('SERVICE_NOT_DRAFT');
  }
  const existing = await prisma.serviceOnboarding.findUnique({
    where: { serviceId },
  });
  if (existing !== null) {
    throw new ServiceOnboardingError('ALREADY_EXISTS');
  }
  const created = await prisma.serviceOnboarding.create({
    data: {
      serviceId,
      status: 'IN_PROGRESS',
      currentStep: 'SERVICE',
      completedSteps: [] as Prisma.InputJsonValue,
    },
  });
  await recordOnboardingChange(prisma, {
    entityId: created.id,
    reason: onboardingReasons.start,
    diff: { after: { serviceId, status: created.status } },
    actorUserId: context.actorUserId,
  });
  return toOnboardingRecord(created);
}
