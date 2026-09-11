import { installCompleteErrorCodes } from './install-complete.constants';

export type InstallCompleteErrorCode =
  (typeof installCompleteErrorCodes)[keyof typeof installCompleteErrorCodes];

export class InstallCompleteError extends Error {
  constructor(
    readonly code: InstallCompleteErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallCompleteError';
  }
}
