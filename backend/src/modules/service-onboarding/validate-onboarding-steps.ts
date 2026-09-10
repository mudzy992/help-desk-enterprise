import type { ServiceOnboardingStep } from '../../generated/prisma/enums';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from '../service-catalog/load-service';
import { loadFormVersionForService } from '../service-catalog/load-form-version';
import { ServiceFormsError } from '../service-catalog/service-forms.error';
import { ServiceOnboardingError } from './service-onboarding.error';
import type {
  ServiceOnboardingApprovalsProvider,
  ServiceOnboardingRecord,
  ServiceOnboardingRoutingProvider,
  ServiceOnboardingSlaProvider,
  ServiceOnboardingValidationIssue,
} from './service-onboarding.types';

export type OnboardingDomainProviders = {
  readonly routing: ServiceOnboardingRoutingProvider;
  readonly sla: ServiceOnboardingSlaProvider;
  readonly approvals: ServiceOnboardingApprovalsProvider;
};

export async function collectStepValidationIssues(
  prisma: PrismaService,
  record: ServiceOnboardingRecord,
  providers: OnboardingDomainProviders,
  steps: readonly ServiceOnboardingStep[],
): Promise<readonly ServiceOnboardingValidationIssue[]> {
  const service = await loadService(prisma, record.serviceId);
  const issues: ServiceOnboardingValidationIssue[] = [];
  for (const step of steps) {
    const issue = await validateStep(prisma, record, service.requiresApproval, providers, step);
    if (issue !== null) {
      issues.push(issue);
    }
  }
  return issues;
}

async function validateStep(
  prisma: PrismaService,
  record: ServiceOnboardingRecord,
  requiresApproval: boolean,
  providers: OnboardingDomainProviders,
  step: ServiceOnboardingStep,
): Promise<ServiceOnboardingValidationIssue | null> {
  try {
    if (step === 'SERVICE') {
      if (record.serviceId.trim().length === 0) {
        throw new ServiceOnboardingError('STEP_PREREQUISITES_NOT_MET');
      }
      return null;
    }
    if (step === 'FORM') {
      await assertActiveFormVersionRef(prisma, record.serviceId, record.formVersionRef);
      return null;
    }
    if (step === 'ROUTING') {
      await providers.routing.validate({
        serviceId: record.serviceId,
        reference: record.routingConfigurationRef ?? '',
      });
      return null;
    }
    if (step === 'SLA') {
      await providers.sla.validate({
        serviceId: record.serviceId,
        reference: record.slaConfigurationRef ?? '',
      });
      return null;
    }
    await providers.approvals.validate({
      serviceId: record.serviceId,
      reference: record.approvalsConfigurationRef ?? '',
      requiresApproval,
    });
    return null;
  } catch (error) {
    const code =
      error instanceof ServiceOnboardingError || error instanceof ServiceFormsError
        ? error.code
        : 'STEP_PREREQUISITES_NOT_MET';
    return { code, step };
  }
}

export async function assertActiveFormVersionRef(
  prisma: PrismaService,
  serviceId: string,
  formVersionRef: string | null,
): Promise<void> {
  if (formVersionRef === null || formVersionRef.trim().length === 0) {
    throw new ServiceOnboardingError('INVALID_FORM_VERSION_REF');
  }
  try {
    const version = await loadFormVersionForService(
      prisma,
      serviceId,
      formVersionRef,
    );
    if (version.status !== 'ACTIVE') {
      throw new ServiceOnboardingError('INVALID_FORM_VERSION_REF');
    }
  } catch (error) {
    if (error instanceof ServiceOnboardingError) {
      throw error;
    }
    throw new ServiceOnboardingError('INVALID_FORM_VERSION_REF');
  }
}
