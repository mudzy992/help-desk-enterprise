import type {
  ServiceOnboardingStatus,
  ServiceOnboardingStep,
} from '../../generated/prisma/enums';
import {
  parseCompletedSteps,
  parseValidationIssues,
} from './parse-onboarding-json';
import type { ServiceOnboardingRecord } from './service-onboarding.types';

export type ServiceOnboardingPersistence = {
  readonly id: string;
  readonly serviceId: string;
  readonly status: ServiceOnboardingStatus;
  readonly currentStep: ServiceOnboardingStep;
  readonly formVersionRef: string | null;
  readonly routingConfigurationRef: string | null;
  readonly slaConfigurationRef: string | null;
  readonly approvalsConfigurationRef: string | null;
  readonly completedSteps: unknown;
  readonly lastValidationErrors: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export function toOnboardingRecord(
  row: ServiceOnboardingPersistence,
): ServiceOnboardingRecord {
  return {
    id: row.id,
    serviceId: row.serviceId,
    status: row.status,
    currentStep: row.currentStep,
    formVersionRef: row.formVersionRef,
    routingConfigurationRef: row.routingConfigurationRef,
    slaConfigurationRef: row.slaConfigurationRef,
    approvalsConfigurationRef: row.approvalsConfigurationRef,
    completedSteps: parseCompletedSteps(row.completedSteps),
    lastValidationErrors: parseValidationIssues(row.lastValidationErrors),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
