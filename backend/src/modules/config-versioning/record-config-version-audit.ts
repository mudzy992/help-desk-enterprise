import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { canonicalizeJson } from '../change-log/canonicalize-json';
import type { JsonValue } from '../change-log/change-log.types';
import { auditLogGenesisHash } from './config-versioning.constants';

export async function recordConfigVersionAudit(
  transaction: Prisma.TransactionClient,
  input: {
    readonly action: string;
    readonly entityId: string;
    readonly actorUserId: string | null;
    readonly metadata: JsonValue;
  },
): Promise<void> {
  const latest = await transaction.auditLog.findFirst({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { hash: true },
  });
  const previousHash = latest?.hash ?? auditLogGenesisHash;
  const canonical = canonicalizeJson({
    action: input.action,
    entityType: 'config_version',
    entityId: input.entityId,
    metadata: input.metadata,
    actorUserId: input.actorUserId,
    previousHash,
  });
  const hash = createHash('sha256')
    .update(previousHash)
    .update('\n')
    .update(JSON.stringify(canonical))
    .digest('hex');
  await transaction.auditLog.create({
    data: {
      action: input.action,
      entityType: 'config_version',
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue,
      previousHash,
      hash,
      actorUserId: input.actorUserId,
    },
  });
}
