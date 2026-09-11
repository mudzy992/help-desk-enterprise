import { installAddonsErrorCodes } from './install-addons.constants';

export type InstallAddonsErrorCode =
  (typeof installAddonsErrorCodes)[keyof typeof installAddonsErrorCodes];

export class InstallAddonsError extends Error {
  constructor(
    readonly code: InstallAddonsErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallAddonsError';
  }
}
