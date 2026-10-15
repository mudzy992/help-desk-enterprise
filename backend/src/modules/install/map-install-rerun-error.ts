import { ForbiddenException, HttpException, UnprocessableEntityException } from '@nestjs/common';
import { SettingsError } from '../settings/settings.error';
import { installRerunEnvironmentKey } from './install-rerun.constants';
import type { InstallRerunErrorCode } from './install-rerun.error';
import { InstallRerunError } from './install-rerun.error';

const messages: Record<InstallRerunErrorCode, string> = {
  INSTALL_RERUN_NOT_ALLOWED: `Install wizard rerun is disabled; set ${installRerunEnvironmentKey}=true on the backend to reopen a finished installation (ops only)`,
};

/**
 * The rerun answers 403 while the ops switch is off, with the exact variable to
 * set. A `SettingsError` can only arrive from the registry refusing a value it
 * already accepted as a default, so it keeps the registry's own wording (422),
 * the way the F5 sections do.
 */
export function mapInstallRerunError(error: unknown): HttpException {
  if (error instanceof SettingsError) {
    return new UnprocessableEntityException({
      code: error.code ?? 'SETTINGS_ERROR',
      message: error.message,
    });
  }
  if (!(error instanceof InstallRerunError)) {
    throw error;
  }
  return new ForbiddenException({ code: error.code, message: messages[error.code] });
}
