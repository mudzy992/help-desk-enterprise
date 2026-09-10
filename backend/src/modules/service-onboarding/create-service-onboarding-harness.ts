import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { defaultServiceLifecycleConfiguration } from '../service-catalog/service-catalog.constants';
import { DefaultOnboardingApprovalsProvider } from './default-onboarding-approvals.provider';
import { DefaultOnboardingRoutingProvider } from './default-onboarding-routing.provider';
import { DefaultOnboardingSlaProvider } from './default-onboarding-sla.provider';
import { createInMemoryServiceOnboardingPrisma } from './create-in-memory-service-onboarding-prisma';
import { defaultServiceOnboardingConfiguration } from './service-onboarding.constants';
import { ServiceOnboardingExecutor } from './service-onboarding.executor';
import { ServiceOnboardingService } from './service-onboarding.service';
import { ServiceOnboardingStepsService } from './service-onboarding-steps.service';
import type { ServiceOnboardingConfiguration } from './service-onboarding.types';

export function createServiceOnboardingHarness(
  onboardingConfiguration: ServiceOnboardingConfiguration = defaultServiceOnboardingConfiguration,
) {
  const memory = createInMemoryServiceOnboardingPrisma();
  const catalog = new ServiceCatalogService(memory.prisma as never, {
    load: async () => defaultServiceLifecycleConfiguration,
  } as never);
  const executor = new ServiceOnboardingExecutor(
    memory.prisma as never,
    { load: async () => onboardingConfiguration } as never,
    { load: async () => defaultServiceLifecycleConfiguration } as never,
    new DefaultOnboardingRoutingProvider(),
    new DefaultOnboardingSlaProvider(memory.prisma as never),
    new DefaultOnboardingApprovalsProvider(),
  );
  return {
    memory,
    catalog,
    onboarding: new ServiceOnboardingService(executor),
    steps: new ServiceOnboardingStepsService(executor),
  };
}
