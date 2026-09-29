import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
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
    case onCallErrorCodes.swapNotPending:
      return new ConflictException(body);
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
