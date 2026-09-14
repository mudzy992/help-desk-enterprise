export class EdgeExtensionError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'RECEIPTS_DISABLED',
    message = code,
  ) {
    super(message);
    this.name = 'EdgeExtensionError';
  }
}
