import { installSmtpErrorCodes } from './install-smtp.constants';

export type InstallSmtpErrorCode =
  (typeof installSmtpErrorCodes)[keyof typeof installSmtpErrorCodes];

export class InstallSmtpError extends Error {
  constructor(
    readonly code: InstallSmtpErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallSmtpError';
  }
}
