import { auditLogGenesisHash } from './audit-log.constants';
import { computeAuditLogHash } from './compute-audit-log-hash';
import type { AuditLogRecord } from './audit-log.types';
import { verifyAuditLogChainIncrementally } from './verify-audit-log-chain';

function chain(count: number): AuditLogRecord[] {
  let previousHash = auditLogGenesisHash;
  return Array.from({ length: count }, (_, index) => {
    const createdAt = new Date(1_700_000_000_000 + index);
    const base = { action: 'audit.export', entityType: 'audit_log', entityId: String(index), metadata: {}, actorUserId: null, requestId: null, organizationalUnitId: null };
    const hash = computeAuditLogHash({ ...base, previousHash, hashAlgorithm: 'sha256' });
    const row: AuditLogRecord = { ...base, id: `row-${String(index).padStart(6, '0')}`, previousHash, hash, createdAt, hashVersion: 1, metadataDigest: null, redactedAt: null };
    previousHash = hash;
    return row;
  });
}

describe('incremental audit verification', () => {
  it('verifies a large chain with a hard page-size memory bound', async () => {
    const rows = chain(1_201);
    const pageLengths: number[] = [];
    const result = await verifyAuditLogChainIncrementally({
      pageSize: 100,
      hashAlgorithm: 'sha256',
      readPage: async (after, take) => {
        const start = after === null ? 0 : rows.findIndex((row) => row.id === after.id) + 1;
        const page = rows.slice(start, start + take);
        pageLengths.push(page.length);
        return page;
      },
    });
    expect(result).toMatchObject({ valid: true, checkedCount: 1_201 });
    expect(Math.max(...pageLengths)).toBe(100);
    expect(pageLengths.length).toBeGreaterThan(12);
  });

  it('reports a global mismatch index without reading an unbounded page', async () => {
    const rows = chain(240);
    rows[175] = { ...rows[175]!, entityId: 'tampered' };
    const result = await verifyAuditLogChainIncrementally({
      pageSize: 50,
      hashAlgorithm: 'sha256',
      readPage: async (after, take) => {
        const start = after === null ? 0 : rows.findIndex((row) => row.id === after.id) + 1;
        return rows.slice(start, start + take);
      },
    });
    expect(result).toMatchObject({ valid: false, firstMismatchIndex: 175 });
  });
});
