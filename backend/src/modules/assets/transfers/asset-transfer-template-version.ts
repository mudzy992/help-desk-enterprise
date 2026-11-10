import type { Prisma } from '../../../generated/prisma/client';

export const assetTransferTemplateVersionUniqueIndex =
  'AssetTransferTemplate_version_key';
export const assetTransferTemplateVersionAllocationMaxAttempts = 3;
const assetTransferTemplateVersionLockKey = 'assets:transfer-template-version';

type DatabaseErrorShape = {
  readonly code?: unknown;
  readonly constraint?: unknown;
  readonly message?: unknown;
  readonly meta?: unknown;
};

/**
 * Allocates the next template version while holding a transaction-scoped lock.
 * The unique index remains the final invariant for mixed-version deployments.
 */
export async function allocateAssetTransferTemplateVersion(
  transaction: Prisma.TransactionClient,
): Promise<number> {
  await transaction.$queryRaw`
    SELECT 1 AS "locked"
    FROM pg_advisory_xact_lock(hashtextextended(${assetTransferTemplateVersionLockKey}, 0))`;
  const latest = await transaction.assetTransferTemplate.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

/** Retry only the unique collision on AssetTransferTemplate.version. */
export function isAssetTransferTemplateVersionConflict(
  error: unknown,
): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const shape = error as DatabaseErrorShape;
  if (shape.code !== 'P2002' && shape.code !== '23505') return false;

  const meta =
    typeof shape.meta === 'object' && shape.meta !== null
      ? (shape.meta as Record<string, unknown>)
      : null;
  const modelName = meta?.modelName;
  if (modelName !== undefined && modelName !== 'AssetTransferTemplate')
    return false;

  const target = meta?.target;
  const targetText = Array.isArray(target)
    ? target.map(String).join('.')
    : typeof target === 'string'
      ? target
      : '';
  const details = [targetText, shape.constraint, shape.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return (
    details.includes(assetTransferTemplateVersionUniqueIndex.toLowerCase()) ||
    (targetText.toLowerCase() === 'version' &&
      modelName === 'AssetTransferTemplate')
  );
}
