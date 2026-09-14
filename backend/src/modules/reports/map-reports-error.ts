import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
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
  };
  if (error.code === reportErrorCodes.forbidden) {
    return new ForbiddenException(body);
  }
  if (error.code === reportErrorCodes.organizationalUnitNotFound) {
    return new NotFoundException(body);
  }
  if (
    error.code === reportErrorCodes.disabled ||
    error.code === reportErrorCodes.bottlenecksDisabled
  ) {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
