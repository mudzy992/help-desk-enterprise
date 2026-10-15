import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { SettingsError } from '../settings/settings.error';
import { installIdentityErrorCodes } from './install-identity.constants';
import { InstallIdentityError } from './install-identity.error';

const messages: Record<string, string> = {
  [installIdentityErrorCodes.superAdminRequired]:
    'Initial SuperAdmin must exist before the identity is saved',
  [installIdentityErrorCodes.invalidInput]:
    'Organisation name, application name, support e-mail or support URL is not valid',
  [installIdentityErrorCodes.invalidLocale]: 'The selected language is not supported',
  [installIdentityErrorCodes.invalidTimeZone]:
    'The time zone is not a known IANA zone',
};

/** F2: the identity step answers 400 with a code the wizard can translate. */
export function mapInstallIdentityError(error: unknown): HttpException {
  if (error instanceof SettingsError) {
    // The registry owns lengths and formats; the wizard only needs to know that
    // the value was refused (the field is highlighted with the same message).
    return new BadRequestException({
      code: installIdentityErrorCodes.invalidInput,
      message: messages[installIdentityErrorCodes.invalidInput],
    });
  }
  if (!(error instanceof InstallIdentityError)) {
    throw error;
  }
  if (error.code === installIdentityErrorCodes.superAdminRequired) {
    return new ConflictException({
      code: error.code,
      message: messages[error.code],
    });
  }
  return new BadRequestException({
    code: error.code,
    message: messages[error.code] ?? 'The identity could not be saved',
  });
}
