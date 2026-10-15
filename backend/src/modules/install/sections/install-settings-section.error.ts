import { installSettingsSectionErrorCodes } from './install-settings-section.constants';

export type InstallSettingsSectionErrorCode =
  (typeof installSettingsSectionErrorCodes)[keyof typeof installSettingsSectionErrorCodes];

/**
 * F5: the section service speaks in these codes; `mapInstallSettingsSectionError`
 * turns them into HTTP answers, so the controller and the service stay free of
 * transport concerns — the same split the other wizard steps use.
 */
export class InstallSettingsSectionError extends Error {
  constructor(
    readonly code: InstallSettingsSectionErrorCode,
    message: string = code,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'InstallSettingsSectionError';
  }
}
