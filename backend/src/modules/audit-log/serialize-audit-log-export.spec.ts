import { toAuditLogExportRow, serializeAuditLogCsv } from './serialize-audit-log-export';
import type { AuditLogRecord } from './audit-log.types';

describe('serializeAuditLogCsv', () => {
  it('emits a stable header and ISO createdAt order', () => {
    const row = toAuditLogExportRow({
      id: 'audit-1',
      action: 'audit.export',
      entityType: 'audit_log',
      entityId: 'ou-it',
      metadata: { format: 'csv' },
      requestId: null,
      previousHash: '0'.repeat(64),
      hash: 'abc',
      actorUserId: 'admin-1',
      organizationalUnitId: 'ou-it',
      createdAt: new Date('2026-09-14T10:00:00.000Z'),
    } satisfies AuditLogRecord);
    const csv = serializeAuditLogCsv([row]);
    expect(csv.split('\n')[0]).toBe(
      'id,createdAt,action,entityType,entityId,actorUserId,organizationalUnitId,requestId,previousHash,hash,metadata',
    );
    expect(csv).toContain('2026-09-14T10:00:00.000Z');
    expect(csv).toContain('"{""format"":""csv""}"');
  });
});
