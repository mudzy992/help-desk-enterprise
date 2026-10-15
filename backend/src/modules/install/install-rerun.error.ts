import { installRerunErrorCodes } from './install-rerun.constants';

export type InstallRerunErrorCode =
  (typeof installRerunErrorCodes)[keyof typeof installRerunErrorCodes];

/**
 * The ops rerun touches settings the wizard owns, so the only failure the
 * operator can cause is asking for it while the switch is off.
 */
export class InstallRerunError extends Error {
  constructor(
    readonly code: InstallRerunErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'InstallRerunError';
  }
}
