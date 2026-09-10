import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DirectorySyncError } from './directory-sync.error';
import type { DirectorySyncErrorCode } from './directory-sync.error';

const messages: Record<DirectorySyncErrorCode, string> = {
  INVALID_SCOPE: 'Directory read scope is invalid or unrestricted',
  DIRECTORY_READ_DISABLED: 'Directory read is disabled',
  DIRECTORY_READ_THROTTLED: 'Directory read was throttled',
  DIRECTORY_SYNC_UNAVAILABLE: 'Directory synchronization is unavailable',
};

export function mapDirectorySyncError(error: unknown): HttpException {
  if (!(error instanceof DirectorySyncError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === 'INVALID_SCOPE') {
    return new BadRequestException(body);
  }
  if (error.code === 'DIRECTORY_READ_THROTTLED') {
    return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
  return new ServiceUnavailableException(body);
}
