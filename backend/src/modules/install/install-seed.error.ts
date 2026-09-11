import { installSeedErrorCodes } from './install-seed.constants';

export type InstallSeedErrorCode =
  (typeof installSeedErrorCodes)[keyof typeof installSeedErrorCodes];

export class InstallSeedError extends Error {
  constructor(
    readonly code: InstallSeedErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallSeedError';
  }
}
