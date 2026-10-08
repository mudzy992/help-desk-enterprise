import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { SettingsError, settingsErrorCodes } from './settings.error';

export function mapSettingsError(error: unknown): HttpException {
  if (!(error instanceof SettingsError)) {
    throw error;
  }
  const body = {
    code: error.code ?? 'SETTINGS_ERROR',
    message: error.message,
    // Paket 5.3.3 (D6): the dependency gate reports exactly which parents are
    // missing so the screen can link to them instead of only apologising.
    ...(error.details === undefined ? {} : { details: error.details }),
  };
  if (error.message.startsWith('Unknown setting key:')) {
    return new NotFoundException({
      code: 'UNKNOWN_SETTING',
      message: error.message,
    });
  }
  if (error.code === settingsErrorCodes.reasonRequired) {
    return new BadRequestException(body);
  }
  if (error.code === settingsErrorCodes.dependencyUnmet) {
    return new BadRequestException(body);
  }
  return new BadRequestException(body);
}
