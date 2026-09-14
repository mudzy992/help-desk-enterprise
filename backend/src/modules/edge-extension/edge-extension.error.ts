import type { EdgeExtensionErrorCode } from './edge-extension.constants';

export class EdgeExtensionError extends Error {
  constructor(
    readonly code: EdgeExtensionErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'EdgeExtensionError';
  }
}
