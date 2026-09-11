import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { installSuperAdminErrorCodes } from './install-super-admin.constants';
import { InstallSuperAdminError } from './install-super-admin.error';
import type { InstallSuperAdminErrorCode } from './install-super-admin.error';

const conflictCodes: readonly InstallSuperAdminErrorCode[] = [
  installSuperAdminErrorCodes.alreadyExists,
  installSuperAdminErrorCodes.emailTaken,
];

const messages: Record<InstallSuperAdminErrorCode, string> = {
  INVALID_SUPER_ADMIN_CREDENTIALS: 'SuperAdmin credentials are invalid',
  SUPER_ADMIN_ALREADY_EXISTS: 'Initial SuperAdmin already exists',
  SUPER_ADMIN_EMAIL_TAKEN: 'SuperAdmin email is already in use',
};

export function mapInstallSuperAdminError(error: unknown): HttpException {
  if (!(error instanceof InstallSuperAdminError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (conflictCodes.includes(error.code)) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
