import { HttpException, HttpStatus } from '@nestjs/common';
import { isDatabaseSaturationError } from './is-database-saturation-error';

export type StandardErrorResponse = {
  readonly code: string;
  readonly message: string;
  readonly details: Record<string, unknown>;
  readonly requestId: string;
};

const fallbackCodes: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION',
  [HttpStatus.UNAUTHORIZED]: 'INVALID_CREDENTIALS',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

export function resolveExceptionHttpStatus(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  if (isDatabaseSaturationError(exception)) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

export function toStandardErrorResponse(
  exception: unknown,
  requestId: string,
): StandardErrorResponse {
  if (!(exception instanceof HttpException)) {
    if (isDatabaseSaturationError(exception)) {
      return {
        code: 'DATABASE_BUSY',
        message: 'The service is temporarily overloaded, retry shortly',
        details: {},
        requestId,
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: {},
      requestId,
    };
  }
  return fromHttpException(exception, requestId);
}

function fromHttpException(
  exception: HttpException,
  requestId: string,
): StandardErrorResponse {
  const status = exception.getStatus();
  const raw = exception.getResponse();
  if (typeof raw === 'string') {
    return {
      code: fallbackCodes[status] ?? 'INTERNAL_ERROR',
      message: raw,
      details: {},
      requestId,
    };
  }
  if (typeof raw !== 'object' || raw === null) {
    return {
      code: fallbackCodes[status] ?? 'INTERNAL_ERROR',
      message: exception.message,
      details: {},
      requestId,
    };
  }
  return fromResponseRecord(raw as Record<string, unknown>, status, requestId);
}

function fromResponseRecord(
  record: Record<string, unknown>,
  status: number,
  requestId: string,
): StandardErrorResponse {
  const messages = Array.isArray(record.message)
    ? record.message.filter((item): item is string => typeof item === 'string')
    : undefined;
  return {
    code:
      typeof record.code === 'string' && record.code.trim().length > 0
        ? record.code
        : (fallbackCodes[status] ?? 'INTERNAL_ERROR'),
    message:
      typeof record.message === 'string'
        ? record.message
        : messages !== undefined
          ? 'Validation failed'
          : 'Request failed',
    details: buildDetails(record, messages),
    requestId,
  };
}

function buildDetails(
  record: Record<string, unknown>,
  messages: string[] | undefined,
): Record<string, unknown> {
  const details: Record<string, unknown> =
    typeof record.details === 'object' &&
    record.details !== null &&
    !Array.isArray(record.details)
      ? { ...(record.details as Record<string, unknown>) }
      : {};
  if (messages !== undefined) {
    details.messages = messages;
  }
  return details;
}
