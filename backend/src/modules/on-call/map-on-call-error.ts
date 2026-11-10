import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OnCallError, onCallErrorCodes } from './on-call.constants';

export function mapOnCallError(error: unknown): unknown {
  if (!(error instanceof OnCallError)) return error;
  const body = { code: error.code, message: error.detail ?? error.code };
  switch (error.code) {
    case onCallErrorCodes.disabled:
      return new ServiceUnavailableException(body);
    case onCallErrorCodes.groupNotFound:
    case onCallErrorCodes.scheduleNotFound:
    case onCallErrorCodes.overrideNotFound:
    case onCallErrorCodes.swapNotFound:
      return new NotFoundException(body);
    case onCallErrorCodes.overlap:
    case onCallErrorCodes.scheduleConflict:
    case onCallErrorCodes.swapNotPending:
    case onCallErrorCodes.swapDuplicate:
      return new ConflictException(body);
    case onCallErrorCodes.swapLimitReached:
      return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
    case onCallErrorCodes.forbidden:
    case onCallErrorCodes.swapNotAllowed:
      return new ForbiddenException(body);
    default:
      return new BadRequestException(body);
  }
}

export async function runOnCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = mapOnCallError(error);
    if (mapped instanceof HttpException) throw mapped;
    throw error;
  }
}
