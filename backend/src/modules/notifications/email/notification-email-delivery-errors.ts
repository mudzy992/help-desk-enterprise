export class NotificationEmailOutcomeUnknownError extends Error {
  readonly code = 'EOUTCOMEUNKNOWN';

  constructor() {
    super('Email provider outcome is unknown; automatic resend is blocked.');
    this.name = NotificationEmailOutcomeUnknownError.name;
  }
}

export class NotificationEmailRetryNotDueError extends Error {
  readonly code = 'ERETRYNOTDUE';

  constructor() {
    super('Email retry is not due yet.');
    this.name = NotificationEmailRetryNotDueError.name;
  }
}

export class NotificationEmailDeliveryDeadError extends Error {
  readonly code = 'EDELIVERYDEAD';

  constructor() {
    super('Email delivery is terminal and cannot be retried automatically.');
    this.name = NotificationEmailDeliveryDeadError.name;
  }
}
