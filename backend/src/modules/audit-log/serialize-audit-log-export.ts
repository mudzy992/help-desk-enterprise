import { canonicalizeJson } from '../change-log/canonicalize-json';
import type { JsonValue } from '../change-log/change-log.types';
import { auditLogExportColumns } from './audit-log.constants';
import type { AuditLogExportRow, AuditLogRecord } from './audit-log.types';

export function toAuditLogExportRow(record: AuditLogRecord): AuditLogExportRow {
  return {
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    actorUserId: record.actorUserId,
    organizationalUnitId: record.organizationalUnitId,
    requestId: record.requestId,
    previousHash: record.previousHash,
    hash: record.hash,
    metadata: record.metadata,
  };
}

export function serializeAuditLogJson(rows: readonly AuditLogExportRow[]): string {
  return `${JSON.stringify(rows.map(canonicalizeExportRow))}\n`;
}

export function serializeAuditLogCsv(rows: readonly AuditLogExportRow[]): string {
  const lines = [
    auditLogExportColumns.join(','),
    ...rows.map((row) =>
      auditLogExportColumns.map((column) => csvCell(row[column])).join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function canonicalizeExportRow(row: AuditLogExportRow): AuditLogExportRow {
  return {
    ...row,
    metadata:
      row.metadata === null ? null : (canonicalizeJson(row.metadata) as JsonValue),
  };
}

function csvCell(value: string | JsonValue | null): string {
  const text =
    value === null
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(canonicalizeJson(value));
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
