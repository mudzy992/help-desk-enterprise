import { installSmtpTestErrorCodes } from './install-smtp-test.constants';

export type InstallSmtpTestErrorCode =
  (typeof installSmtpTestErrorCodes)[keyof typeof installSmtpTestErrorCodes];

export class InstallSmtpTestError extends Error {
  constructor(
    readonly code: InstallSmtpTestErrorCode,
    /** The server's own answer; kept beside the mapped code, never instead of it. */
    message: string = code,
  ) {
    super(message);
    this.name = 'InstallSmtpTestError';
  }
}
