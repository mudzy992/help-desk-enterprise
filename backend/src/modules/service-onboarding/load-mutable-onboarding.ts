import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from '../service-catalog/load-service';
import {
  assertOnboardingConsistency,
  assertOnboardingEnabled,
} from './assert-onboarding-consistency';
import { assertOnboardingIsMutable } from './assert-onboarding-status-transition';
import { loadServiceOnboarding } from './load-service-onboarding';
import { ServiceOnboardingError } from './service-onboarding.error';
import type {
  ServiceOnboardingConfiguration,
  ServiceOnboardingRecord,
} from './service-onboarding.types';

export async function loadMutableOnboarding(
  prisma: PrismaService,
  serviceId: string,
  configuration: ServiceOnboardingConfiguration,
): Promise<ServiceOnboardingRecord> {
  assertOnboardingEnabled(configuration.enabled);
  const record = await loadServiceOnboarding(prisma, serviceId);
  const service = await loadService(prisma, serviceId);
  assertOnboardingConsistency({
    record,
    serviceLifecycle: service.lifecycle,
  });
  assertOnboardingIsMutable(record.status);
  if (service.lifecycle !== 'DRAFT') {
    throw new ServiceOnboardingError('SERVICE_NOT_DRAFT');
  }
  return record;
}
