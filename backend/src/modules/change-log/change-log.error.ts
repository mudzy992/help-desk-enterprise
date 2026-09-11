import { changeLogErrorCodes } from './change-log.constants';

export type ChangeLogErrorCode =
  (typeof changeLogErrorCodes)[keyof typeof changeLogErrorCodes];

export class ChangeLogError extends Error {
  constructor(
    readonly code: ChangeLogErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'ChangeLogError';
  }
}
