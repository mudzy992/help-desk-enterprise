import {
  observabilityErrorCodes,
  type ObservabilityErrorCode,
} from './observability.constants';

export class ObservabilityError extends Error {
  constructor(readonly code: ObservabilityErrorCode) {
    super(code);
    this.name = 'ObservabilityError';
  }
}

export function isObservabilityError(
  error: unknown,
): error is ObservabilityError {
  return error instanceof ObservabilityError;
}

export { observabilityErrorCodes };
