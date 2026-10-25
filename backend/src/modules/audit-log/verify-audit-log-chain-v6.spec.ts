import { auditLogGenesisHash } from './audit-log.constants';
import { auditHashVersions } from './build-canonical-audit-payload';
import { computeAuditLogHash, computeAuditMetadataDigest } from './compute-audit-log-hash';
import type { AuditLogRecord } from './audit-log.types';
import { verifyAuditLogChain } from './verify-audit-log-chain';

function record(): AuditLogRecord {
  const createdAt = new Date('2026-10-25T12:00:00.000Z');
  const metadata = { format: 'json' };
  const metadataDigest = computeAuditMetadataDigest(metadata);
  const base = {
    id: 'audit-v6-1', action: 'audit.export', entityType: 'audit_log', entityId: 'scope-1',
    metadata, actorUserId: 'actor-1', requestId: 'request-1', organizationalUnitId: null,
    previousHash: auditLogGenesisHash, createdAt, redactedAt: null, hashVersion: auditHashVersions.v6,
    hashAlgorithm: 'sha256' as const, metadataDigest, chainPartition: 'global', actionSchemaVersion: 1,
  };
  return { ...base, hash: computeAuditLogHash({
    previousHash: base.previousHash, action: base.action, entityType: base.entityType,
    entityId: base.entityId, metadata, actorUserId: base.actorUserId, requestId: base.requestId,
    organizationalUnitId: base.organizationalUnitId, hashVersion: auditHashVersions.v6,
    hashAlgorithm: base.hashAlgorithm, metadataDigest, rowId: base.id, createdAt, redactedAt: null,
    chainPartition: base.chainPartition, actionSchemaVersion: base.actionSchemaVersion,
  }) };
}

const verify = (value: AuditLogRecord) => verifyAuditLogChain({ records: [value], hashAlgorithm: 'sha256' });

describe('v6 audit action schema envelope', () => {
  it('hash-binds the action schema version', () => {
    const original = record();
    expect(verify(original).valid).toBe(true);
    expect(verify({ ...original, actionSchemaVersion: 2 }).valid).toBe(false);
  });
});
