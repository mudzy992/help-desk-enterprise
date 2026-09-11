import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { SettingsError } from '../settings/settings.error';
import { installLoginProviderErrorCodes } from './install-login-provider.constants';
import { InstallLoginProviderError } from './install-login-provider.error';
import type { InstallLoginProviderErrorCode } from './install-login-provider.error';

const messages: Record<InstallLoginProviderErrorCode, string> = {
  INVALID_LOGIN_PROVIDER_CONFIGURATION:
    'Login provider configuration is invalid or incomplete',
  SUPER_ADMIN_REQUIRED:
    'Initial SuperAdmin must exist before login provider setup',
};

export function mapInstallLoginProviderError(error: unknown): HttpException {
  if (error instanceof SettingsError) {
    return new BadRequestException({
      code: installLoginProviderErrorCodes.invalidConfiguration,
      message: messages.INVALID_LOGIN_PROVIDER_CONFIGURATION,
    });
  }
  if (!(error instanceof InstallLoginProviderError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === installLoginProviderErrorCodes.superAdminRequired) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
