import { installPolicyPackErrorCodes } from './install-policy-pack.constants';

export type InstallPolicyPackErrorCode =
  (typeof installPolicyPackErrorCodes)[keyof typeof installPolicyPackErrorCodes];

export class InstallPolicyPackError extends Error {
  constructor(
    readonly code: InstallPolicyPackErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallPolicyPackError';
  }
}
