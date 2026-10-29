import {
  auditCursorMaxLength,
  auditCursorPattern,
  auditLogErrorCodes,
  auditOpaqueIdMaxLength,
  auditOpaqueIdPattern,
} from './audit-log.constants';
import { AuditLogError } from './audit-log.error';

const cursorVersion = 1;

type AuditCursorEnvelope = Readonly<{ v: typeof cursorVersion; id: string }>;

export function encodeAuditCursor(id: string): string {
  assertOpaqueAuditId(id);
  return Buffer.from(JSON.stringify({ v: cursorVersion, id } satisfies AuditCursorEnvelope), 'utf8').toString('base64url');
}

export function decodeAuditCursor(cursor: string | null): string | null {
  if (cursor === null) return null;
  try {
    if (cursor.length === 0 || cursor.length > auditCursorMaxLength || !auditCursorPattern.test(cursor)) invalid();
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.length > auditCursorMaxLength || decoded.toString('base64url') !== cursor) invalid();
    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(',') !== 'id,v' || record.v !== cursorVersion || typeof record.id !== 'string') invalid();
    assertOpaqueAuditId(record.id);
    return record.id;
  } catch (error) {
    if (error instanceof AuditLogError) throw error;
    invalid();
  }
}

export function assertOpaqueAuditId(value: string): void {
  if (value.length === 0 || value.length > auditOpaqueIdMaxLength || !auditOpaqueIdPattern.test(value)) invalid();
}

function invalid(): never {
  throw new AuditLogError(auditLogErrorCodes.invalidCursor);
}
