import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from '../service-catalog/load-service';
import {
  assertOnboardingConsistency,
  assertOnboardingEnabled,
} from './assert-onboarding-consistency';
import { assertOnboardingStatusTransition } from './assert-onboarding-status-transition';
import { loadServiceOnboarding } from './load-service-onboarding';
import { persistOnboardingRecord } from './persist-onboarding-record';
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

export async function abandonServiceOnboarding(
  prisma: PrismaService,
  serviceId: string,
  configuration: ServiceOnboardingConfiguration,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  assertOnboardingEnabled(configuration.enabled);
  const record = await loadServiceOnboarding(prisma, serviceId);
  const service = await loadService(prisma, serviceId);
  assertOnboardingConsistency({ record, serviceLifecycle: service.lifecycle });
  assertOnboardingStatusTransition({ from: record.status, to: 'ABANDONED' });
  const updated = await persistOnboardingRecord(prisma, record, {
    status: 'ABANDONED',
  });
  await recordOnboardingChange(prisma, {
    entityId: record.id,
    reason: onboardingReasons.abandon,
    diff: { after: { status: 'ABANDONED' } },
    actorUserId: context.actorUserId,
  });
  return updated;
}

export async function resumeServiceOnboarding(
  prisma: PrismaService,
  serviceId: string,
  configuration: ServiceOnboardingConfiguration,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  assertOnboardingEnabled(configuration.enabled);
  const record = await loadServiceOnboarding(prisma, serviceId);
  const service = await loadService(prisma, serviceId);
  if (record.status !== 'ABANDONED') {
    throw new ServiceOnboardingError('ONBOARDING_NOT_RESUMABLE');
  }
  if (service.lifecycle !== 'DRAFT') {
    throw new ServiceOnboardingError('SERVICE_NOT_DRAFT');
  }
  assertOnboardingStatusTransition({ from: record.status, to: 'IN_PROGRESS' });
  const updated = await persistOnboardingRecord(prisma, record, {
    status: 'IN_PROGRESS',
    lastValidationErrors: [],
  });
  await recordOnboardingChange(prisma, {
    entityId: record.id,
    reason: onboardingReasons.resume,
    diff: { after: { status: updated.status } },
    actorUserId: context.actorUserId,
  });
  return updated;
}
