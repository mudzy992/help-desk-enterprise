import { installLoginProviderErrorCodes } from './install-login-provider.constants';

export type InstallLoginProviderErrorCode =
  (typeof installLoginProviderErrorCodes)[keyof typeof installLoginProviderErrorCodes];

export class InstallLoginProviderError extends Error {
  constructor(
    readonly code: InstallLoginProviderErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallLoginProviderError';
  }
}
