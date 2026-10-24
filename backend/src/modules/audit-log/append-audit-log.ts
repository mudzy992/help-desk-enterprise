import type { Prisma } from '../../generated/prisma/client';
import {
  auditLogChainLockKey,
  auditLogGenesisHash,
  defaultAuditHashAlgorithm,
} from './audit-log.constants';
import { auditHashVersions } from './build-canonical-audit-payload';
import { computeAuditLogHash, computeAuditMetadataDigest } from './compute-audit-log-hash';
import { prepareAuditEntry } from './audit-event-policy';
import type {
  AuditLogWriteClient,
  RecordAuditEntryInput,
} from './audit-log.types';

export async function appendAuditLog(
  transaction: AuditLogWriteClient,
  input: RecordAuditEntryInput,
): Promise<void> {
  const prepared = prepareAuditEntry(input);
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${auditLogChainLockKey})`;
  const latest = await transaction.auditLog.findFirst({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { hash: true },
  });
  const previousHash = latest?.hash ?? auditLogGenesisHash;
  const requestId = prepared.requestId ?? null;
  const organizationalUnitId = prepared.organizationalUnitId ?? null;
  // Paket 2.6 (§6.5): new rows commit to a digest of the metadata (v2).
  const metadataDigest = computeAuditMetadataDigest(prepared.metadata);
  const hashAlgorithm = prepared.hashAlgorithm ?? defaultAuditHashAlgorithm;
  const hash = computeAuditLogHash({
    previousHash,
    action: prepared.action,
    entityType: prepared.entityType,
    entityId: prepared.entityId,
    metadata: prepared.metadata,
    actorUserId: prepared.actorUserId,
    requestId,
    organizationalUnitId,
    hashAlgorithm,
    hashVersion: auditHashVersions.v3,
    metadataDigest,
  });
  await transaction.auditLog.create({
    data: {
      action: prepared.action,
      entityType: prepared.entityType,
      entityId: prepared.entityId,
      metadata: prepared.metadata as Prisma.InputJsonValue,
      requestId,
      previousHash,
      hash,
      actorUserId: prepared.actorUserId,
      organizationalUnitId,
      hashVersion: auditHashVersions.v3,
      metadataDigest,
      hashAlgorithm,
    },
  });
}
