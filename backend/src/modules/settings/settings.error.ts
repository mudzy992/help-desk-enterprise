import { ChangeLogError } from '../change-log/change-log.error';
import { changeLogErrorCodes } from '../change-log/change-log.constants';

export const settingsErrorCodes = {
  reasonRequired: changeLogErrorCodes.reasonRequired,
} as const;

export class SettingsError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SettingsError';
  }
}

export function mapChangeLogErrorToSettingsError(error: unknown): never {
  if (
    error instanceof ChangeLogError &&
    error.code === changeLogErrorCodes.reasonRequired
  ) {
    throw new SettingsError(
      'A reason is required for this settings change',
      settingsErrorCodes.reasonRequired,
    );
  }
  throw error;
}
