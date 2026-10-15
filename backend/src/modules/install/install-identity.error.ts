import { installIdentityErrorCodes } from './install-identity.constants';

export type InstallIdentityErrorCode =
  (typeof installIdentityErrorCodes)[keyof typeof installIdentityErrorCodes];

export class InstallIdentityError extends Error {
  constructor(
    readonly code: InstallIdentityErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallIdentityError';
  }
}
