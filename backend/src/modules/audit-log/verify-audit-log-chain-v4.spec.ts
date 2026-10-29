import { auditLogGenesisHash } from './audit-log.constants';
import { auditHashVersions } from './build-canonical-audit-payload';
import { computeAuditLogHash, computeAuditMetadataDigest } from './compute-audit-log-hash';
import type { AuditLogRecord } from './audit-log.types';
import { verifyAuditLogChain } from './verify-audit-log-chain';

function record(): AuditLogRecord {
  const createdAt = new Date('2026-10-24T12:00:00.000Z');
  const metadata = { operation: 'test' };
  const metadataDigest = computeAuditMetadataDigest(metadata);
  const base = {
    id: 'audit-v4-1', action: 'audit.export', entityType: 'audit_log', entityId: 'scope-1',
    metadata, actorUserId: 'actor-1', requestId: 'request-1', organizationalUnitId: 'ou-1',
    previousHash: auditLogGenesisHash, createdAt, redactedAt: null, hashVersion: auditHashVersions.v4,
    hashAlgorithm: 'sha256' as const, metadataDigest,
  };
  return { ...base, hash: computeAuditLogHash({
    previousHash: base.previousHash, action: base.action, entityType: base.entityType,
    entityId: base.entityId, metadata, actorUserId: base.actorUserId, requestId: base.requestId,
    organizationalUnitId: base.organizationalUnitId, hashVersion: auditHashVersions.v4,
    hashAlgorithm: base.hashAlgorithm, metadataDigest, rowId: base.id, createdAt, redactedAt: null,
  }) };
}

const verify = (value: AuditLogRecord) => verifyAuditLogChain({ records: [value], hashAlgorithm: 'sha256' });

describe('v4 audit envelope', () => {
  it('binds row id, creation time and redaction state', () => {
    const original = record();
    expect(verify(original).valid).toBe(true);
    expect(verify({ ...original, id: 'forged-id' }).valid).toBe(false);
    expect(verify({ ...original, createdAt: new Date(original.createdAt.getTime() + 1) }).valid).toBe(false);
    expect(verify({ ...original, redactedAt: new Date() }).valid).toBe(false);
  });
});
