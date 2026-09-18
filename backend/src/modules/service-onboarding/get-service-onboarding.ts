import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from '../service-catalog/load-service';
import {
  assertOnboardingConsistency,
  assertOnboardingEnabled,
} from './assert-onboarding-consistency';
import { loadServiceOnboarding } from './load-service-onboarding';
import type {
  ServiceOnboardingConfiguration,
  ServiceOnboardingRecord,
  ServiceOnboardingResponse,
  ServiceOnboardingRoutingProvider,
} from './service-onboarding.types';

export async function getServiceOnboarding(
  prisma: PrismaService,
  serviceId: string,
  configuration: ServiceOnboardingConfiguration,
  routingProvider: ServiceOnboardingRoutingProvider,
): Promise<ServiceOnboardingResponse> {
  assertOnboardingEnabled(configuration.enabled);
  const record = await loadServiceOnboarding(prisma, serviceId);
  const service = await loadService(prisma, serviceId);
  assertOnboardingConsistency({
    record,
    serviceLifecycle: service.lifecycle,
  });
  const routingSuggestion = configuration.autoFillRoutingEnabled
    ? await routingProvider.suggest(serviceId)
    : null;
  return toOnboardingResponse(record, service.lifecycle, routingSuggestion);
}

export function toOnboardingResponse(
  record: ServiceOnboardingRecord,
  serviceLifecycle: ServiceOnboardingResponse['serviceLifecycle'],
  routingSuggestion: string | null,
  warnings: readonly string[] = [],
): ServiceOnboardingResponse {
  return {
    id: record.id,
    serviceId: record.serviceId,
    status: record.status,
    currentStep: record.currentStep,
    completedSteps: record.completedSteps,
    formVersionRef: record.formVersionRef,
    routingConfigurationRef: record.routingConfigurationRef,
    slaConfigurationRef: record.slaConfigurationRef,
    approvalsConfigurationRef: record.approvalsConfigurationRef,
    routingSuggestion,
    lastValidationErrors: record.lastValidationErrors,
    serviceLifecycle,
    warnings,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
