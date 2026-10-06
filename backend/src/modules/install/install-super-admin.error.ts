import { installSuperAdminErrorCodes } from './install-super-admin.constants';

export type InstallSuperAdminErrorCode =
  (typeof installSuperAdminErrorCodes)[keyof typeof installSuperAdminErrorCodes];

export class InstallSuperAdminError extends Error {
  constructor(
    readonly code: InstallSuperAdminErrorCode,
    message = code,
    /**
     * Paket 5.1 (M1 #1): which password rules the founder password broke
     * (`TOO_SHORT`, `COMMON_PASSWORD`, …), so the wizard can name them instead
     * of showing one generic line.
     */
    readonly violations: readonly string[] = [],
  ) {
    super(message);
    this.name = 'InstallSuperAdminError';
  }
}
