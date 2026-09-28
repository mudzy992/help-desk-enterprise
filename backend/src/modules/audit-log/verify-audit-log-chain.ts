import { auditLogGenesisHash } from './audit-log.constants';
import { auditHashVersions } from './build-canonical-audit-payload';
import { computeAuditLogHash, computeAuditMetadataDigest } from './compute-audit-log-hash';
import type {
  AuditHashAlgorithm,
  AuditLogRecord,
  AuditLogVerifyResult,
} from './audit-log.types';

export type AuditChainStart = {
  readonly throughHash: string;
  readonly throughCreatedAt: Date;
  readonly purgedCount: number;
};

/**
 * Verifies the chain from the genesis hash, or from the latest retention
 * checkpoint when older rows were purged (paket 2.6 §6.5).
 *
 * - v1 row: hash over the metadata. Redacted v1 rows are "sealed": the stored
 *   hash is trusted for the link, the content cannot be re-checked.
 * - v2 row: hash over `metadataDigest`, always re-computed; for rows that are
 *   not redacted the metadata must also still match its digest.
 */
export function verifyAuditLogChain(input: {
  readonly records: readonly AuditLogRecord[];
  readonly hashAlgorithm: AuditHashAlgorithm;
  readonly start?: AuditChainStart | null;
}): Extract<AuditLogVerifyResult, { enabled: true }> {
  const ordered = [...input.records].sort(compareAuditLogChainOrder);
  const start = input.start ?? null;
  let redactedCount = 0;
  let sealedCount = 0;
  const details = () => ({
    redactedCount,
    sealedCount,
    checkpoint:
      start === null
        ? null
        : {
            throughHash: start.throughHash,
            throughCreatedAt: start.throughCreatedAt.toISOString(),
            purgedCount: start.purgedCount,
          },
  });
  for (const [index, record] of ordered.entries()) {
    const previousHash =
      index === 0 ? (start?.throughHash ?? auditLogGenesisHash) : ordered[index - 1]?.hash;
    if (previousHash === undefined || record.previousHash !== previousHash) {
      return mismatch(ordered.length, record.id, index, details());
    }
    const redacted = record.redactedAt !== null && record.redactedAt !== undefined;
    if (redacted) redactedCount += 1;
    const version = record.hashVersion ?? auditHashVersions.v1;
    if (version === auditHashVersions.v2) {
      const digest = record.metadataDigest ?? '';
      if (!redacted && computeAuditMetadataDigest(record.metadata ?? {}) !== digest) {
        return mismatch(ordered.length, record.id, index, details());
      }
      const expected = computeAuditLogHash({
        previousHash,
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        metadata: {},
        actorUserId: record.actorUserId,
        requestId: record.requestId,
        organizationalUnitId: record.organizationalUnitId,
        hashAlgorithm: input.hashAlgorithm,
        hashVersion: auditHashVersions.v2,
        metadataDigest: digest,
      });
      if (record.hash !== expected) {
        return mismatch(ordered.length, record.id, index, details());
      }
      continue;
    }
    if (redacted) {
      sealedCount += 1;
      continue;
    }
    const expectedHash = computeAuditLogHash({
      previousHash,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      metadata: record.metadata ?? {},
      actorUserId: record.actorUserId,
      requestId: record.requestId,
      organizationalUnitId: record.organizationalUnitId,
      hashAlgorithm: input.hashAlgorithm,
    });
    if (record.hash !== expectedHash) {
      return mismatch(ordered.length, record.id, index, details());
    }
  }
  return {
    enabled: true,
    valid: true,
    checkedCount: ordered.length,
    ...details(),
  };
}

function mismatch(
  checkedCount: number,
  firstMismatchId: string,
  firstMismatchIndex: number,
  details: object,
): Extract<AuditLogVerifyResult, { valid: false }> {
  return {
    enabled: true,
    valid: false,
    checkedCount,
    firstMismatchId,
    firstMismatchIndex,
    ...details,
  };
}

export function compareAuditLogChainOrder(
  left: Pick<AuditLogRecord, 'createdAt' | 'id'>,
  right: Pick<AuditLogRecord, 'createdAt' | 'id'>,
): number {
  const created = left.createdAt.getTime() - right.createdAt.getTime();
  if (created !== 0) {
    return created;
  }
  return left.id.localeCompare(right.id);
}
