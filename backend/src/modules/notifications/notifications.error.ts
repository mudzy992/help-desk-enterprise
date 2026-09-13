export type NotificationsErrorCode = 'NOT_FOUND' | 'FORBIDDEN';

export class NotificationsError extends Error {
  constructor(
    readonly code: NotificationsErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'NotificationsError';
  }
}
