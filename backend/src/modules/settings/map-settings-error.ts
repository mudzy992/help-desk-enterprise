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
  return new BadRequestException(body);
}
