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
    if (version === auditHashVersions.v2 || version === auditHashVersions.v3 || version === auditHashVersions.v4) {
      const digest = record.metadataDigest ?? '';
      const hashAlgorithm = version === auditHashVersions.v3 || version === auditHashVersions.v4
        ? record.hashAlgorithm
        : input.hashAlgorithm;
      if (hashAlgorithm === undefined) {
        return mismatch(ordered.length, record.id, index, details());
      }
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
        hashAlgorithm,
        hashVersion: version,
        metadataDigest: digest,
        ...(version === auditHashVersions.v4 ? {
          rowId: record.id,
          createdAt: record.createdAt,
          redactedAt: record.redactedAt ?? null,
        } : {}),
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

export async function verifyAuditLogChainIncrementally(input: {
  readonly readPage: (after: { readonly createdAt: Date; readonly id: string } | null, take: number) => Promise<readonly AuditLogRecord[]>;
  readonly pageSize: number;
  readonly hashAlgorithm: AuditHashAlgorithm;
  readonly start?: AuditChainStart | null;
}): Promise<Extract<AuditLogVerifyResult, { enabled: true }>> {
  let after: { createdAt: Date; id: string } | null = null;
  let chainStart = input.start ?? null;
  let checkedCount = 0;
  let redactedCount = 0;
  let sealedCount = 0;
  for (;;) {
    const page = await input.readPage(after, input.pageSize);
    if (page.length === 0) break;
    const result = verifyAuditLogChain({ records: page, hashAlgorithm: input.hashAlgorithm, start: chainStart });
    redactedCount += result.redactedCount ?? 0;
    sealedCount += result.sealedCount ?? 0;
    if (!result.valid) {
      return { ...result, checkedCount: checkedCount + result.checkedCount, firstMismatchIndex: checkedCount + result.firstMismatchIndex };
    }
    checkedCount += page.length;
    const last = page.at(-1)!;
    after = { createdAt: last.createdAt, id: last.id };
    chainStart = { throughHash: last.hash, throughCreatedAt: last.createdAt, purgedCount: 0 };
    if (page.length < input.pageSize) break;
  }
  return {
    enabled: true,
    valid: true,
    checkedCount,
    redactedCount,
    sealedCount,
    checkpoint: input.start === null || input.start === undefined ? null : {
      throughHash: input.start.throughHash,
      throughCreatedAt: input.start.throughCreatedAt.toISOString(),
      purgedCount: input.start.purgedCount,
    },
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
