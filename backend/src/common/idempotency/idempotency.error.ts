export const idempotencyErrorCodes = {
  invalidKey: 'IDEMPOTENCY_KEY_INVALID',
  payloadMismatch: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
  inProgress: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
  claimLost: 'IDEMPOTENCY_CLAIM_LOST',
  responseTooLarge: 'IDEMPOTENCY_RESPONSE_TOO_LARGE',
} as const;

export type IdempotencyErrorCode = (typeof idempotencyErrorCodes)[keyof typeof idempotencyErrorCodes];

export class IdempotencyError extends Error {
  constructor(readonly code: IdempotencyErrorCode) {
    super(code);
    this.name = 'IdempotencyError';
  }
}
