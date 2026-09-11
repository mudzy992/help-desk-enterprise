import { ConflictException, HttpException } from '@nestjs/common';
import { installCompleteErrorCodes } from './install-complete.constants';
import { InstallCompleteError } from './install-complete.error';
import type { InstallCompleteErrorCode } from './install-complete.error';

const messages: Record<InstallCompleteErrorCode, string> = {
  SUPER_ADMIN_REQUIRED:
    'Initial SuperAdmin must exist before install completion',
};

export function mapInstallCompleteError(error: unknown): HttpException {
  if (!(error instanceof InstallCompleteError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === installCompleteErrorCodes.superAdminRequired) {
    return new ConflictException(body);
  }
  return new ConflictException(body);
}
