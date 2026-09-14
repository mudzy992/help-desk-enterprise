import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { auditLogErrorCodes, auditLogErrorMessages } from './audit-log.constants';
import { AuditLogError } from './audit-log.error';

export function mapAuditLogError(error: unknown): HttpException {
  if (!(error instanceof AuditLogError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: auditLogErrorMessages[error.code],
  };
  if (error.code === auditLogErrorCodes.forbidden) {
    return new ForbiddenException(body);
  }
  if (error.code === auditLogErrorCodes.organizationalUnitNotFound) {
    return new NotFoundException(body);
  }
  if (
    error.code === auditLogErrorCodes.exportDisabled ||
    error.code === auditLogErrorCodes.verifyDisabled
  ) {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
