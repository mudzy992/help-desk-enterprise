export const bulkCommandErrorCodes = {
  invalidRequest: 'BULK_COMMAND_INVALID_REQUEST',
  itemFailed: 'BULK_COMMAND_ITEM_FAILED',
  internalFailure: 'BULK_COMMAND_INTERNAL_FAILURE',
} as const;

export class BulkCommandValidationError extends Error {
  readonly code = bulkCommandErrorCodes.invalidRequest;
  constructor() {
    super(bulkCommandErrorCodes.invalidRequest);
    this.name = 'BulkCommandValidationError';
  }
}

export class BulkCommandItemError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'BulkCommandItemError';
  }
}
