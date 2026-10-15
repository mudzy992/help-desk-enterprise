import {
  BadRequestException,
  ConflictException,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SettingsError } from '../../settings/settings.error';
import { installSettingsSectionErrorCodes } from './install-settings-section.constants';
import type { InstallSettingsSectionErrorCode } from './install-settings-section.error';
import { InstallSettingsSectionError } from './install-settings-section.error';

const messages: Record<InstallSettingsSectionErrorCode, string> = {
  INSTALL_SETTINGS_SECTION_UNKNOWN: 'Unknown install settings section',
  INSTALL_SETTINGS_SECTION_KEY_NOT_ALLOWED: 'The wizard may only write the keys of its own section',
  SUPER_ADMIN_REQUIRED: 'Initial SuperAdmin must exist before a section is saved',
  INSTALL_SETTINGS_SECTION_DEPENDENCY_UNMET: 'This section needs something that does not exist yet',
  INSTALL_SETTINGS_SECTION_INVALID_VALUES: 'The registry rejected the values',
};

/**
 * F5: the wizard answers with the registry's own wording for values it refused
 * (`SETTING_DEPENDENCY_UNMET`, a range, a type) so an operator sees the same
 * sentence the Settings screen would show, and with its own codes for the rules
 * only the wizard has.
 */
export function mapInstallSettingsSectionError(error: unknown): HttpException {
  if (error instanceof SettingsError) {
    return new UnprocessableEntityException({
      // An untyped `SettingsError` is a value the registry refused (type, range,
      // allowed values); only a coded one may claim a dependency is the problem.
      code: error.code ?? installSettingsSectionErrorCodes.invalidValues,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
  if (!(error instanceof InstallSettingsSectionError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (error.code === installSettingsSectionErrorCodes.unknownSection) {
    return new BadRequestException(body);
  }
  if (
    error.code === installSettingsSectionErrorCodes.superAdminRequired ||
    error.code === installSettingsSectionErrorCodes.dependencyUnmet
  ) {
    return new ConflictException({
      ...body,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
  return new BadRequestException({
    ...body,
    ...(error.details === undefined ? {} : { details: error.details }),
  });
}
