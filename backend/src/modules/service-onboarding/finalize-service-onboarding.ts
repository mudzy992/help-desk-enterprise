import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from '../service-catalog/load-service';
import { assertServiceLifecycleTransition } from '../service-catalog/assert-service-lifecycle-transition';
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from '../service-catalog/record-service-catalog-change';
import type { ServiceLifecycleConfiguration } from '../service-catalog/service-catalog.types';
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
import { onboardingSteps } from './service-onboarding.constants';
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

export type FinalizeServiceOnboardingResult = {
  readonly record: ServiceOnboardingRecord;
  readonly warnings: readonly string[];
};

export async function finalizeServiceOnboarding(
  prisma: PrismaService,
  serviceId: string,
  configuration: ServiceOnboardingConfiguration,
  lifecycleConfiguration: ServiceLifecycleConfiguration,
  providers: OnboardingDomainProviders,
  context: OnboardingMutationContext,
): Promise<FinalizeServiceOnboardingResult> {
  assertOnboardingEnabled(configuration.enabled);
  const record = await loadServiceOnboarding(prisma, serviceId);
  const service = await loadService(prisma, serviceId);
  assertOnboardingConsistency({ record, serviceLifecycle: service.lifecycle });
  assertOnboardingStatusTransition({ from: record.status, to: 'COMPLETED' });
  if (service.lifecycle !== 'DRAFT') {
    throw new ServiceOnboardingError('SERVICE_NOT_DRAFT');
  }
  const issues = await collectStepValidationIssues(
    prisma,
    record,
    providers,
    onboardingSteps,
  );
  if (issues.length > 0) {
    await persistOnboardingRecord(prisma, record, {
      lastValidationErrors: issues,
    });
    throw new ServiceOnboardingError('FINAL_VALIDATION_FAILED');
  }
  const coverageWarning =
    await providers.routing.evaluateActivationCoverage(serviceId);
  const sla = await providers.sla.validate({
    serviceId,
    reference: record.slaConfigurationRef ?? '',
  });
  const approvals = await providers.approvals.validate({
    serviceId,
    reference: record.approvalsConfigurationRef ?? '',
    requiresApproval: service.requiresApproval,
  });
  assertServiceLifecycleTransition({
    from: service.lifecycle,
    to: 'ACTIVE',
    configuration: lifecycleConfiguration,
  });
  const completed = await prisma.$transaction(async (transaction) =>
    applyFinalization(transaction as PrismaService, {
      record,
      serviceId,
      slaProfileId: sla.resolvedEntityId ?? service.slaProfileId,
      requiresApproval: approvals.requiresApproval,
      actorUserId: context.actorUserId,
    }),
  );
  return {
    record: completed,
    warnings: coverageWarning === null ? [] : [coverageWarning],
  };
}

async function applyFinalization(
  prisma: PrismaService,
  input: {
    readonly record: ServiceOnboardingRecord;
    readonly serviceId: string;
    readonly slaProfileId: string | null;
    readonly requiresApproval: boolean;
    readonly actorUserId: string | null;
  },
): Promise<ServiceOnboardingRecord> {
  await prisma.service.update({
    where: { id: input.serviceId },
    data: {
      lifecycle: 'ACTIVE',
      slaProfileId: input.slaProfileId,
      requiresApproval: input.requiresApproval,
    },
  });
  await recordServiceCatalogChange(prisma, {
    entityType: serviceChangeLogEntityType(),
    entityId: input.serviceId,
    reason: 'lifecycle_transition',
    diff: {
      before: { lifecycle: 'DRAFT' },
      after: { lifecycle: 'ACTIVE' },
      onboardingId: input.record.id,
    },
    actorUserId: input.actorUserId,
  });
  const completed = await persistOnboardingRecord(prisma, input.record, {
    status: 'COMPLETED',
    lastValidationErrors: [],
  });
  await recordOnboardingChange(prisma, {
    entityId: input.record.id,
    reason: onboardingReasons.finalize,
    diff: { after: { status: 'COMPLETED', serviceLifecycle: 'ACTIVE' } },
    actorUserId: input.actorUserId,
  });
  return completed;
}
