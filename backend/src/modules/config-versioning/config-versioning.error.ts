import {
  configVersioningErrorCodes,
  type ConfigVersioningErrorCode,
} from './config-versioning.constants';
import type { ConfigValidationIssue } from './config-versioning.types';

export class ConfigVersioningError extends Error {
  constructor(
    readonly code: ConfigVersioningErrorCode,
    readonly details?: readonly ConfigValidationIssue[],
  ) {
    super(code);
    this.name = 'ConfigVersioningError';
  }
}

export function isConfigVersioningError(
  error: unknown,
): error is ConfigVersioningError {
  return error instanceof ConfigVersioningError;
}

export { configVersioningErrorCodes };
