import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ServiceOnboardingError } from './service-onboarding.error';
import type { ServiceOnboardingErrorCode } from './service-onboarding.error';

const notFoundCodes: readonly ServiceOnboardingErrorCode[] = ['NOT_FOUND'];
const conflictCodes: readonly ServiceOnboardingErrorCode[] = ['ALREADY_EXISTS'];

const messages: Record<ServiceOnboardingErrorCode, string> = {
  DISABLED: 'Service onboarding wizard is disabled',
  UNAVAILABLE: 'Service onboarding configuration is unavailable',
  NOT_FOUND: 'Service onboarding was not found',
  ALREADY_EXISTS: 'This service already has an onboarding workflow',
  INVALID_STATUS_TRANSITION: 'Onboarding status transition is not allowed',
  INVALID_STEP_TRANSITION: 'Onboarding step transition is not allowed',
  STEP_PREREQUISITES_NOT_MET: 'Onboarding step prerequisites are not met',
  INVALID_FORM_VERSION_REF: 'formVersionRef is invalid for this service',
  INVALID_ROUTING_CONFIGURATION_REF: 'Routing configuration reference is invalid',
  INVALID_SLA_CONFIGURATION_REF: 'SLA configuration reference is invalid',
  INVALID_APPROVALS_CONFIGURATION_REF:
    'Approvals configuration reference is invalid',
  FINAL_VALIDATION_FAILED: 'Onboarding final validation failed',
  INCONSISTENT_ONBOARDING_STATE: 'Onboarding state is inconsistent',
  SERVICE_NOT_DRAFT: 'Onboarding can only run on a DRAFT service',
  ONBOARDING_NOT_RESUMABLE: 'Only abandoned onboarding can be resumed',
};

export function mapServiceOnboardingError(error: unknown): HttpException {
  if (!(error instanceof ServiceOnboardingError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  if (conflictCodes.includes(error.code)) {
    return new ConflictException(body);
  }
  if (error.code === 'UNAVAILABLE') {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
