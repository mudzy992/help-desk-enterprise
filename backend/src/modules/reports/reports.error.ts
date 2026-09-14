import {
  reportErrorCodes,
  type ReportErrorCode,
} from './reports.constants';

export class ReportsError extends Error {
  constructor(readonly code: ReportErrorCode) {
    super(code);
    this.name = 'ReportsError';
  }
}

export function isReportsError(error: unknown): error is ReportsError {
  return error instanceof ReportsError;
}

export { reportErrorCodes };
