import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { AuditLogTransactionalClient, RecordAuditEntryInput } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';

export type AssetAuditInput = Omit<RecordAuditEntryInput, 'metadata'> & {
  readonly metadata: Record<string, unknown>;
};

export type AssetAuditFailureMetrics = {
  recordAuditWriteFailure(): Promise<void>;
};

type AssetAuditTransactionHost = Pick<PrismaClient, '$transaction'>;

async function recordAuditFailure(metrics?: AssetAuditFailureMetrics): Promise<void> {
  if (metrics === undefined) return;
  await metrics.recordAuditWriteFailure().catch(() => undefined);
}

/**
 * Records an asset audit event against either the root Prisma client (which
 * opens its own transaction) or the business transaction client (which keeps
 * the event atomic with the mutation).
 */
export async function recordAssetAuditEntry(
  client: PrismaClient | Prisma.TransactionClient,
  input: AssetAuditInput,
  metrics?: AssetAuditFailureMetrics,
): Promise<void> {
  try {
    await recordAuditEntry(client as unknown as AuditLogTransactionalClient, {
      ...input,
      metadata: input.metadata as never,
    });
  } catch (error) {
    await recordAuditFailure(metrics);
    throw error;
  }
}

/**
 * Runs a business write and its global audit entry in one Prisma transaction.
 * The audit factory may return null for mutations that intentionally have no
 * global-audit event (for example, a non-issued asset move).
 */
export async function withAssetAuditTransaction<T>(
  prisma: AssetAuditTransactionHost,
  write: (transaction: Prisma.TransactionClient) => Promise<T>,
  audit: (result: T) => AssetAuditInput | null,
  metrics?: AssetAuditFailureMetrics,
): Promise<T> {
  return prisma.$transaction(async (transaction) => {
    const result = await write(transaction);
    const entry = audit(result);
    if (entry !== null) await recordAssetAuditEntry(transaction, entry, metrics);
    return result;
  });
}
