import { auditLogGenesisHash } from './audit-log.constants';
import { computeAuditLogHash } from './compute-audit-log-hash';
import type {
  AuditHashAlgorithm,
  AuditLogRecord,
  AuditLogVerifyResult,
} from './audit-log.types';

export function verifyAuditLogChain(input: {
  readonly records: readonly AuditLogRecord[];
  readonly hashAlgorithm: AuditHashAlgorithm;
}): Extract<AuditLogVerifyResult, { enabled: true }> {
  const ordered = [...input.records].sort(compareAuditLogChainOrder);
  for (const [index, record] of ordered.entries()) {
    const previousHash =
      index === 0 ? auditLogGenesisHash : ordered[index - 1]?.hash;
    if (previousHash === undefined || record.previousHash !== previousHash) {
      return mismatch(ordered.length, record.id, index);
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
      return mismatch(ordered.length, record.id, index);
    }
  }
  return {
    enabled: true,
    valid: true,
    checkedCount: ordered.length,
  };
}

function mismatch(
  checkedCount: number,
  firstMismatchId: string,
  firstMismatchIndex: number,
): Extract<AuditLogVerifyResult, { valid: false }> {
  return {
    enabled: true,
    valid: false,
    checkedCount,
    firstMismatchId,
    firstMismatchIndex,
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
