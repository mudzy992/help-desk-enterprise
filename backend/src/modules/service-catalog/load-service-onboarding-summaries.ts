import { PrismaService } from '../../common/prisma/prisma.service';
import { parseCompletedSteps } from '../service-onboarding/parse-onboarding-json';
import type { ServiceOnboardingSummary } from './service-catalog.types';

export async function loadServiceOnboardingSummaries(
  prisma: PrismaService,
  serviceIds: readonly string[],
): Promise<ReadonlyMap<string, ServiceOnboardingSummary>> {
  if (serviceIds.length === 0) return new Map();
  const rows = await prisma.serviceOnboarding.findMany({
    where: { serviceId: { in: [...serviceIds] } },
    select: {
      serviceId: true,
      status: true,
      currentStep: true,
      completedSteps: true,
    },
  });
  return new Map(
    rows.map((row) => [
      row.serviceId,
      {
        status: row.status,
        currentStep: row.currentStep,
        completedSteps: parseCompletedSteps(row.completedSteps),
      },
    ]),
  );
}
