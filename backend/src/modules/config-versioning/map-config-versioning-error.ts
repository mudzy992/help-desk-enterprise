import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChangeLogError } from '../change-log/change-log.error';
import { changeLogErrorCodes } from '../change-log/change-log.constants';
import {
  configVersioningErrorCodes,
  configVersioningErrorMessages,
} from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';

export function mapConfigVersioningError(error: unknown): HttpException {
  if (
    error instanceof ChangeLogError &&
    error.code === changeLogErrorCodes.reasonRequired
  ) {
    return new BadRequestException({
      code: configVersioningErrorCodes.reasonRequired,
      message: configVersioningErrorMessages.REASON_REQUIRED,
    });
  }
  if (!(error instanceof ConfigVersioningError)) {
    throw error;
  }
  const body =
    error.details === undefined
      ? {
          code: error.code,
          message: configVersioningErrorMessages[error.code],
        }
      : {
          code: error.code,
          message: configVersioningErrorMessages[error.code],
          details: error.details,
        };
  if (error.code === configVersioningErrorCodes.notFound) {
    return new NotFoundException(body);
  }
  if (error.code === configVersioningErrorCodes.againstNotFound) {
    return new NotFoundException(body);
  }
  if (error.code === configVersioningErrorCodes.rollbackDisabled) {
    return new ForbiddenException(body);
  }
  if (error.code === configVersioningErrorCodes.alreadyActive) {
    return new ConflictException(body);
  }
  if (error.code === configVersioningErrorCodes.disabled) {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
