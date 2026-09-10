export type ServiceOnboardingErrorCode =
  | 'DISABLED'
  | 'UNAVAILABLE'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_STATUS_TRANSITION'
  | 'INVALID_STEP_TRANSITION'
  | 'STEP_PREREQUISITES_NOT_MET'
  | 'INVALID_FORM_VERSION_REF'
  | 'INVALID_ROUTING_CONFIGURATION_REF'
  | 'INVALID_SLA_CONFIGURATION_REF'
  | 'INVALID_APPROVALS_CONFIGURATION_REF'
  | 'FINAL_VALIDATION_FAILED'
  | 'INCONSISTENT_ONBOARDING_STATE'
  | 'SERVICE_NOT_DRAFT'
  | 'ONBOARDING_NOT_RESUMABLE';

export class ServiceOnboardingError extends Error {
  constructor(
    readonly code: ServiceOnboardingErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'ServiceOnboardingError';
  }
}
