import type {
  ServiceOnboardingStatus,
  ServiceOnboardingStep,
} from '../../generated/prisma/enums';
import type { ServiceOnboardingConfiguration } from './service-onboarding.types';

export const onboardingSteps = [
  'SERVICE',
  'FORM',
  'ROUTING',
  'SLA',
  'APPROVALS',
] as const satisfies readonly ServiceOnboardingStep[];

export const onboardingStatuses = [
  'IN_PROGRESS',
  'READY_FOR_FINALIZATION',
  'COMPLETED',
  'ABANDONED',
] as const satisfies readonly ServiceOnboardingStatus[];

export const defaultServiceOnboardingConfiguration: ServiceOnboardingConfiguration =
  {
    enabled: true,
    requireValidationBeforeActivate: true,
    autoFillRoutingEnabled: true,
    autoFillRoutingRequireConfirm: true,
  };

export const approvalsNotRequiredReference = 'not_required';

export const onboardingChangeLogEntityType = 'service_onboarding';

export const onboardingChangeLogReasons = {
  create: 'create',
  start: 'start',
  saveStep: 'save_step',
  completeStep: 'complete_step',
  finalize: 'finalize',
  abandon: 'abandon',
  resume: 'resume',
} as const;

export const onboardingConfigurationRefMaximumLength = 128;

export const SERVICE_ONBOARDING_ROUTING_PROVIDER =
  'SERVICE_ONBOARDING_ROUTING_PROVIDER';
export const SERVICE_ONBOARDING_SLA_PROVIDER =
  'SERVICE_ONBOARDING_SLA_PROVIDER';
export const SERVICE_ONBOARDING_APPROVALS_PROVIDER =
  'SERVICE_ONBOARDING_APPROVALS_PROVIDER';
