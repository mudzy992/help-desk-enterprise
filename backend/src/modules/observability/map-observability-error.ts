import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  observabilityErrorCodes,
  observabilityErrorMessages,
} from './observability.constants';
import { ObservabilityError } from './observability.error';

export function mapObservabilityError(error: unknown): HttpException {
  if (!(error instanceof ObservabilityError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: observabilityErrorMessages[error.code],
  };
  if (error.code === observabilityErrorCodes.forbidden) {
    return new ForbiddenException(body);
  }
  if (error.code === observabilityErrorCodes.disabled) {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
