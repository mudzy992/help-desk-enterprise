import { installSuperAdminErrorCodes } from './install-super-admin.constants';

export type InstallSuperAdminErrorCode =
  (typeof installSuperAdminErrorCodes)[keyof typeof installSuperAdminErrorCodes];

export class InstallSuperAdminError extends Error {
  constructor(
    readonly code: InstallSuperAdminErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallSuperAdminError';
  }
}
