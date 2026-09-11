import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { SettingsError } from '../settings/settings.error';
import { installSmtpErrorCodes } from './install-smtp.constants';
import { InstallSmtpError } from './install-smtp.error';
import type { InstallSmtpErrorCode } from './install-smtp.error';

const messages: Record<InstallSmtpErrorCode, string> = {
  INVALID_SMTP_CONFIGURATION: 'SMTP configuration is invalid or incomplete',
  SUPER_ADMIN_REQUIRED: 'Initial SuperAdmin must exist before SMTP setup',
};

export function mapInstallSmtpError(error: unknown): HttpException {
  if (error instanceof SettingsError) {
    return new BadRequestException({
      code: installSmtpErrorCodes.invalidConfiguration,
      message: messages.INVALID_SMTP_CONFIGURATION,
    });
  }
  if (!(error instanceof InstallSmtpError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === installSmtpErrorCodes.superAdminRequired) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
