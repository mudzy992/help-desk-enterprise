export const storageWriteErrorCodes = {
  invalidInput: 'STORAGE_WRITE_INPUT_INVALID',
  payloadTooLarge: 'STORAGE_WRITE_PAYLOAD_TOO_LARGE',
  conflict: 'STORAGE_WRITE_CONFLICT',
  compensationFailed: 'STORAGE_WRITE_COMPENSATION_FAILED',
} as const;

export class StorageWriteError extends Error {
  constructor(readonly code: (typeof storageWriteErrorCodes)[keyof typeof storageWriteErrorCodes], options?: ErrorOptions) {
    super(code, options);
    this.name = 'StorageWriteError';
  }
}
