import type { ServiceOnboardingStep } from '../../generated/prisma/enums';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadMutableOnboarding } from './load-mutable-onboarding';
import {
  assertStepIsReachable,
  previousStepsOf,
} from './onboarding-step-order';
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
import {
  collectStepValidationIssues,
  type OnboardingDomainProviders,
} from './validate-onboarding-steps';

export async function completeOnboardingStep(
  prisma: PrismaService,
  serviceId: string,
  step: ServiceOnboardingStep,
  configuration: ServiceOnboardingConfiguration,
  providers: OnboardingDomainProviders,
  context: OnboardingMutationContext,
): Promise<ServiceOnboardingRecord> {
  const record = await loadMutableOnboarding(prisma, serviceId, configuration);
  assertStepIsReachable(record.completedSteps, step);
  for (const previous of previousStepsOf(step)) {
    if (!record.completedSteps.includes(previous)) {
      throw new ServiceOnboardingError('INVALID_STEP_TRANSITION');
    }
  }
  const issues = await collectStepValidationIssues(
    prisma,
    record,
    providers,
    [step],
  );
  if (issues.length > 0) {
    await persistOnboardingRecord(prisma, record, {
      lastValidationErrors: issues,
    });
    throw new ServiceOnboardingError('STEP_PREREQUISITES_NOT_MET');
  }
  const completedSteps = record.completedSteps.includes(step)
    ? record.completedSteps
    : [...record.completedSteps, step];
  const updated = await persistOnboardingRecord(prisma, record, {
    completedSteps,
    lastValidationErrors: [],
  });
  await recordOnboardingChange(prisma, {
    entityId: record.id,
    reason: onboardingReasons.completeStep,
    diff: { step, completedSteps },
    actorUserId: context.actorUserId,
  });
  return updated;
}
