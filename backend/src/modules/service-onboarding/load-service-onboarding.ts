import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceOnboardingError } from './service-onboarding.error';
import type { ServiceOnboardingRecord } from './service-onboarding.types';
import { toOnboardingRecord } from './to-onboarding-record';

export async function loadServiceOnboarding(
  prisma: PrismaService,
  serviceId: string,
): Promise<ServiceOnboardingRecord> {
  const row = await prisma.serviceOnboarding.findUnique({
    where: { serviceId },
  });
  if (row === null) {
    throw new ServiceOnboardingError('NOT_FOUND');
  }
  return toOnboardingRecord(row);
}
