import type { Prisma } from '../../generated/prisma/client';
import {
  auditLogChainLockKey,
  auditLogGenesisHash,
  defaultAuditHashAlgorithm,
} from './audit-log.constants';
import { auditHashVersions } from './build-canonical-audit-payload';
import { computeAuditLogHash, computeAuditMetadataDigest } from './compute-audit-log-hash';
import type {
  AuditLogWriteClient,
  RecordAuditEntryInput,
} from './audit-log.types';

export async function appendAuditLog(
  transaction: AuditLogWriteClient,
  input: RecordAuditEntryInput,
): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${auditLogChainLockKey})`;
  const latest = await transaction.auditLog.findFirst({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { hash: true },
  });
  const previousHash = latest?.hash ?? auditLogGenesisHash;
  const requestId = input.requestId ?? null;
  const organizationalUnitId = input.organizationalUnitId ?? null;
  // Paket 2.6 (§6.5): new rows commit to a digest of the metadata (v2).
  const metadataDigest = computeAuditMetadataDigest(input.metadata);
  const hash = computeAuditLogHash({
    previousHash,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
    actorUserId: input.actorUserId,
    requestId,
    organizationalUnitId,
    hashAlgorithm: input.hashAlgorithm ?? defaultAuditHashAlgorithm,
    hashVersion: auditHashVersions.v2,
    metadataDigest,
  });
  await transaction.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue,
      requestId,
      previousHash,
      hash,
      actorUserId: input.actorUserId,
      organizationalUnitId,
      hashVersion: auditHashVersions.v2,
      metadataDigest,
    },
  });
}
