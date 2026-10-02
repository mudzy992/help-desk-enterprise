/** Paket 3.1: connector errors; codes are mapped to HTTP responses by controllers. */
export type TeamsErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED_ACTIVITY'
  | 'TOKEN_UNAVAILABLE'
  | 'TRANSPORT_FAILED'
  | 'CONVERSATION_GONE'
  | 'THROTTLED';

export class TeamsError extends Error {
  constructor(
    readonly code: TeamsErrorCode,
    message?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message ?? code);
    this.name = 'TeamsError';
  }

  /** Transient errors are retried by the integration queue; the others are final. */
  get retryable(): boolean {
    return this.code === 'TRANSPORT_FAILED' || this.code === 'THROTTLED' || this.code === 'TOKEN_UNAVAILABLE';
  }
}
