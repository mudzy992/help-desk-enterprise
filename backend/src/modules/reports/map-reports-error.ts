import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IdempotencyError, idempotencyErrorCodes } from '../../common/idempotency/idempotency.error';
import { reportErrorCodes, reportErrorMessages } from './reports.constants';
import { ReportsError } from './reports.error';

export function mapReportsError(error: unknown): HttpException {
  // W7.106 (`BA-reports-16`): a repeated „send now” is answered from the idempotency record, and a *different*
  // payload under the same key is a client error — not a 500. Both statuses match the rest of the system.
  if (error instanceof IdempotencyError) {
    const body = { code: error.code, message: idempotencyMessage(error.code) };
    if (error.code === idempotencyErrorCodes.invalidKey) {
      return new BadRequestException(body);
    }
    if (
      error.code === idempotencyErrorCodes.inProgress ||
      error.code === idempotencyErrorCodes.payloadMismatch ||
      error.code === idempotencyErrorCodes.claimLost
    ) {
      return new ConflictException(body);
    }
    throw error;
  }
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
    error.code === reportErrorCodes.scheduleDisabled ||
    // W7.94: a busy limit lock is operational, not a bad request — the client may retry as-is.
    error.code === reportErrorCodes.scheduleLimitUnavailable
  ) {
    return new ServiceUnavailableException(body);
  }
  if (error.code === reportErrorCodes.scheduleLimit) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}

function idempotencyMessage(code: string): string {
  if (code === idempotencyErrorCodes.invalidKey) {
    return 'The Idempotency-Key header is missing or malformed';
  }
  if (code === idempotencyErrorCodes.payloadMismatch) {
    return 'This Idempotency-Key was already used for a different command';
  }
  if (code === idempotencyErrorCodes.inProgress) {
    return 'The same command is still being processed; retry in a moment';
  }
  return 'The command could not be completed; retry with the same Idempotency-Key';
}
