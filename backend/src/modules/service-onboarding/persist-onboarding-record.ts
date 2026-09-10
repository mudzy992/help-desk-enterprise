import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { deriveOnboardingWorkflow } from './derive-onboarding-workflow';
import type { ServiceOnboardingRecord } from './service-onboarding.types';
import { toOnboardingRecord } from './to-onboarding-record';

export async function persistOnboardingRecord(
  prisma: PrismaService,
  record: ServiceOnboardingRecord,
  patch: Partial<
    Pick<
      ServiceOnboardingRecord,
      | 'formVersionRef'
      | 'routingConfigurationRef'
      | 'slaConfigurationRef'
      | 'approvalsConfigurationRef'
      | 'completedSteps'
      | 'lastValidationErrors'
      | 'status'
    >
  >,
): Promise<ServiceOnboardingRecord> {
  const completedSteps = patch.completedSteps ?? record.completedSteps;
  const workflow = deriveOnboardingWorkflow({
    status: patch.status ?? record.status,
    completedSteps,
  });
  const updated = await prisma.serviceOnboarding.update({
    where: { id: record.id },
    data: {
      formVersionRef:
        patch.formVersionRef === undefined
          ? record.formVersionRef
          : patch.formVersionRef,
      routingConfigurationRef:
        patch.routingConfigurationRef === undefined
          ? record.routingConfigurationRef
          : patch.routingConfigurationRef,
      slaConfigurationRef:
        patch.slaConfigurationRef === undefined
          ? record.slaConfigurationRef
          : patch.slaConfigurationRef,
      approvalsConfigurationRef:
        patch.approvalsConfigurationRef === undefined
          ? record.approvalsConfigurationRef
          : patch.approvalsConfigurationRef,
      completedSteps: [...completedSteps] as Prisma.InputJsonValue,
      lastValidationErrors:
        patch.lastValidationErrors === undefined
          ? (record.lastValidationErrors as unknown as Prisma.InputJsonValue)
          : (patch.lastValidationErrors as unknown as Prisma.InputJsonValue),
      status: workflow.status,
      currentStep: workflow.currentStep,
    },
  });
  return toOnboardingRecord(updated);
}
