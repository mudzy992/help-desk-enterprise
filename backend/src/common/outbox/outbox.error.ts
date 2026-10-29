export const outboxErrorCodes = {
  invalidInput: 'OUTBOX_INPUT_INVALID',
  payloadMismatch: 'OUTBOX_PAYLOAD_MISMATCH',
  payloadTooLarge: 'OUTBOX_PAYLOAD_TOO_LARGE',
  claimLost: 'OUTBOX_CLAIM_LOST',
  replayConflict: 'OUTBOX_REPLAY_CONFLICT',
} as const;

export class OutboxError extends Error {
  constructor(readonly code: (typeof outboxErrorCodes)[keyof typeof outboxErrorCodes]) {
    super(code);
    this.name = 'OutboxError';
  }
}
