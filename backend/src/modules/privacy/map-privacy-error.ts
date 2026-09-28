import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { privacyErrorCodes, privacyErrorMessages } from './privacy.constants';
import { PrivacyError } from './privacy.error';

export function mapPrivacyError(error: unknown): HttpException {
  if (!(error instanceof PrivacyError)) {
    throw error;
  }
  const body = { code: error.code, message: privacyErrorMessages[error.code], ...(error.details ?? {}) };
  switch (error.code) {
    case privacyErrorCodes.forbidden:
    case privacyErrorCodes.identityConfirmationFailed:
    case privacyErrorCodes.approverMustDiffer:
      return new ForbiddenException(body);
    case privacyErrorCodes.notFound:
      return new NotFoundException(body);
    case privacyErrorCodes.disabled:
      return new ServiceUnavailableException(body);
    case privacyErrorCodes.exportExpired:
      return new GoneException(body);
    case privacyErrorCodes.invalidTransition:
    case privacyErrorCodes.extensionNotAllowed:
    case privacyErrorCodes.anonymizationBlocked:
    case privacyErrorCodes.approvalRequired:
    case privacyErrorCodes.exportNotReady:
    case privacyErrorCodes.retentionDisabled:
    case privacyErrorCodes.legalHoldActive:
    case privacyErrorCodes.alreadyRunning:
      return new ConflictException(body);
    default:
      return new BadRequestException(body);
  }
}
