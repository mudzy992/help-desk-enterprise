import { ConflictException, HttpException } from '@nestjs/common';
import { installCompleteErrorCodes } from './install-complete.constants';
import { InstallCompleteError } from './install-complete.error';
import type { InstallCompleteErrorCode } from './install-complete.error';

const messages: Record<InstallCompleteErrorCode, string> = {
  SUPER_ADMIN_REQUIRED:
    'Initial SuperAdmin must exist before install completion',
  INSTALL_NOT_READY:
    'The installation is not ready for tickets yet',
};

export function mapInstallCompleteError(error: unknown): HttpException {
  if (!(error instanceof InstallCompleteError)) {
    throw error;
  }
  const body = {
    code: error.code,
    message: messages[error.code],
    // F0.7: the wizard shows exactly which checks are red instead of a generic
    // "not ready" (frontend: `map-install-complete-error.ts`).
    ...(error.missing.length > 0 ? { details: { missing: [...error.missing] } } : {}),
  };
  if (error.code === installCompleteErrorCodes.superAdminRequired) {
    return new ConflictException(body);
  }
  return new ConflictException(body);
}
