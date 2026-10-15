import {
  installStepSkipErrorCodes,
  installProfileErrorCodes,
} from './install-profile.constants';

export type InstallProfileErrorCode =
  (typeof installProfileErrorCodes)[keyof typeof installProfileErrorCodes];

export type InstallStepSkipErrorCode =
  (typeof installStepSkipErrorCodes)[keyof typeof installStepSkipErrorCodes];

export class InstallProfileError extends Error {
  constructor(
    readonly code: InstallProfileErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallProfileError';
  }
}

export class InstallStepSkipError extends Error {
  constructor(
    readonly code: InstallStepSkipErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallStepSkipError';
  }
}
