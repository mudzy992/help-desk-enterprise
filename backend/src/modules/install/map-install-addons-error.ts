import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { SettingsError } from '../settings/settings.error';
import { installAddonsErrorCodes } from './install-addons.constants';
import { InstallAddonsError } from './install-addons.error';
import type { InstallAddonsErrorCode } from './install-addons.error';

const messages: Record<InstallAddonsErrorCode, string> = {
  INVALID_ADDON_CONFIGURATION:
    'Addon configuration is invalid or incomplete',
  UNSUPPORTED_ADDON_KEY: 'One or more addon keys are not in the catalog',
  SUPER_ADMIN_REQUIRED: 'Initial SuperAdmin must exist before addon setup',
};

export function mapInstallAddonsError(error: unknown): HttpException {
  if (error instanceof SettingsError) {
    return new BadRequestException({
      code: installAddonsErrorCodes.invalidConfiguration,
      message: messages.INVALID_ADDON_CONFIGURATION,
    });
  }
  if (!(error instanceof InstallAddonsError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === installAddonsErrorCodes.superAdminRequired) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
