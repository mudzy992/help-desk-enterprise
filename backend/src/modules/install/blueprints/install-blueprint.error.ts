import { installBlueprintErrorCodes } from './install-blueprint.constants';

export type InstallBlueprintErrorCode =
  (typeof installBlueprintErrorCodes)[keyof typeof installBlueprintErrorCodes];

export class InstallBlueprintError extends Error {
  constructor(
    readonly code: InstallBlueprintErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'InstallBlueprintError';
  }
}
