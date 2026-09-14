export type IntegrationQueueErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_STATUS'
  | 'ADMIN_UI_DISABLED'
  | 'UNAVAILABLE';

export class IntegrationQueueError extends Error {
  constructor(
    readonly code: IntegrationQueueErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'IntegrationQueueError';
  }
}
