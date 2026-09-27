import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { reportErrorCodes, reportErrorMessages } from './reports.constants';
import { ReportsError } from './reports.error';

export function mapReportsError(error: unknown): HttpException {
  if (!(error instanceof ReportsError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: reportErrorMessages[error.code],
    ...(error.details ?? {}),
  };
  if (error.code === reportErrorCodes.forbidden) {
    return new ForbiddenException(body);
  }
  if (error.code === reportErrorCodes.tooLarge) {
    return new PayloadTooLargeException(body);
  }
  if (
    error.code === reportErrorCodes.organizationalUnitNotFound ||
    error.code === reportErrorCodes.scheduleNotFound
  ) {
    return new NotFoundException(body);
  }
  if (
    error.code === reportErrorCodes.disabled ||
    error.code === reportErrorCodes.bottlenecksDisabled ||
    error.code === reportErrorCodes.trendsDisabled ||
    error.code === reportErrorCodes.scheduleDisabled
  ) {
    return new ServiceUnavailableException(body);
  }
  if (error.code === reportErrorCodes.scheduleLimit) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
