import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import {
  auditLogChainLockKey,
  auditLogMaintenanceLockKey,
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
  const organizationalUnitId = prepared.organizationalUnitId ?? null;
  const chainPartition = organizationalUnitId === null ? 'global' : `ou:${organizationalUnitId}`;
  const partitionLockKey = createHash('sha256').update(chainPartition).digest().readInt32BE(0);
  await transaction.$executeRaw`
    SELECT
      pg_advisory_xact_lock_shared(${auditLogMaintenanceLockKey}),
      pg_advisory_xact_lock(${auditLogChainLockKey}, ${partitionLockKey})`;
  const latest = await transaction.auditLog.findFirst({
    where: { chainPartition },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { hash: true, createdAt: true },
  });
  const previousHash = latest?.hash ?? auditLogGenesisHash;
  const requestId = prepared.requestId ?? null;
  // Paket 2.6 (§6.5): new rows commit to a digest of the metadata (v2).
  const metadataDigest = computeAuditMetadataDigest(prepared.metadata);
  const hashAlgorithm = prepared.hashAlgorithm ?? defaultAuditHashAlgorithm;
  const rowId = randomUUID();
  const createdAt = new Date(Math.max(Date.now(), (latest?.createdAt?.getTime() ?? -1) + 1));
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
    hashVersion: auditHashVersions.v6,
    metadataDigest,
    rowId,
    createdAt,
    redactedAt: null,
    chainPartition,
    actionSchemaVersion: prepared.actionSchemaVersion,
  });
  await transaction.auditLog.create({
    data: {
      id: rowId,
      createdAt,
      action: prepared.action,
      entityType: prepared.entityType,
      entityId: prepared.entityId,
      metadata: prepared.metadata as Prisma.InputJsonValue,
      requestId,
      previousHash,
      hash,
      actorUserId: prepared.actorUserId,
      organizationalUnitId,
      hashVersion: auditHashVersions.v6,
      metadataDigest,
      hashAlgorithm,
      chainPartition,
      actionSchemaVersion: prepared.actionSchemaVersion,
    },
  });
}
