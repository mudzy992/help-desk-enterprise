import { installCompleteErrorCodes } from './install-complete.constants';

export type InstallCompleteErrorCode =
  (typeof installCompleteErrorCodes)[keyof typeof installCompleteErrorCodes];

export class InstallCompleteError extends Error {
  constructor(
    readonly code: InstallCompleteErrorCode,
    message = code,
    /** F0.7: readiness keys that are not green yet (empty for other codes). */
    readonly missing: readonly string[] = [],
  ) {
    super(message);
    this.name = 'InstallCompleteError';
  }
}
