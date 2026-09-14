import {
  auditLogErrorCodes,
  type AuditLogErrorCode,
} from './audit-log.constants';

export class AuditLogError extends Error {
  constructor(readonly code: AuditLogErrorCode) {
    super(code);
    this.name = 'AuditLogError';
  }
}

export function isAuditLogError(error: unknown): error is AuditLogError {
  return error instanceof AuditLogError;
}

export { auditLogErrorCodes };
