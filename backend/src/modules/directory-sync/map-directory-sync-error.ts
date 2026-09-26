import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DirectorySyncError } from './directory-sync.error';
import type { DirectorySyncErrorCode } from './directory-sync.error';

const messages: Record<DirectorySyncErrorCode, string> = {
  INVALID_SCOPE: 'Directory read scope is invalid or unrestricted',
  DIRECTORY_READ_DISABLED: 'Directory read is disabled',
  DIRECTORY_READ_THROTTLED: 'Directory read was throttled',
  DIRECTORY_SYNC_UNAVAILABLE: 'Directory synchronization is unavailable',
  DIRECTORY_NOT_CONFIGURED: 'LDAPS connection settings are incomplete',
  DIRECTORY_SOURCE_NOT_LDAPS: 'Directory source is not LDAPS',
  DIRECTORY_CONNECTION_FAILED: 'No domain controller accepted the connection',
  DIRECTORY_BACKOFF: 'Directory access is paused after a recent error',
  DIRECTORY_SYNC_COOLDOWN: 'A full directory sync ran recently',
  DIRECTORY_SYNC_IN_PROGRESS: 'Another directory sync is running',
  DIRECTORY_PLAN_NOT_FOUND: 'Dry-run not found',
  DIRECTORY_PLAN_EXPIRED: 'Dry-run is too old; run it again',
  DIRECTORY_PLAN_ALREADY_APPLIED: 'Dry-run was already applied',
  DIRECTORY_SAFEGUARD_TRIPPED: 'Sync aborted: too many deactivations',
};

const conflictCodes: ReadonlySet<DirectorySyncErrorCode> = new Set([
  'DIRECTORY_SOURCE_NOT_LDAPS',
  'DIRECTORY_SYNC_IN_PROGRESS',
  'DIRECTORY_PLAN_EXPIRED',
  'DIRECTORY_PLAN_ALREADY_APPLIED',
  'DIRECTORY_SAFEGUARD_TRIPPED',
]);

export function mapDirectorySyncError(error: unknown): HttpException {
  if (!(error instanceof DirectorySyncError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: messages[error.code],
    ...(error.details === undefined ? {} : { details: error.details }),
  };
  if (error.code === 'INVALID_SCOPE' || error.code === 'DIRECTORY_NOT_CONFIGURED') {
    return new BadRequestException(body);
  }
  if (error.code === 'DIRECTORY_READ_THROTTLED' || error.code === 'DIRECTORY_SYNC_COOLDOWN') {
    return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
  if (error.code === 'DIRECTORY_PLAN_NOT_FOUND') {
    return new NotFoundException(body);
  }
  if (conflictCodes.has(error.code)) {
    return new ConflictException(body);
  }
  if (error.code === 'DIRECTORY_CONNECTION_FAILED') {
    return new HttpException(body, HttpStatus.BAD_GATEWAY);
  }
  return new ServiceUnavailableException(body);
}
