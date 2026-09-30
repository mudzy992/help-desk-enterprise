import type { Prisma } from '../../generated/prisma/client';

/**
 * Paket 3.2 (§15): `count` new tags `{prefix}{year}-{00001}` continuing the
 * highest number. A transaction-scoped advisory lock serialises bulk writers
 * (import, directory sync); a manual create racing them hits the unique index
 * and that batch fails (and can simply be run again).
 */
export async function allocateAssetTags(transaction: Prisma.TransactionClient, count: number, prefix: string): Promise<string[]> {
  if (count === 0) return [];
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('asset-tag-sequence'))`;
  const base = `${prefix}${new Date().getUTCFullYear()}-`;
  const rows = await transaction.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(substring("assetTag" FROM ${base.length + 1}) AS INTEGER)) AS "max"
    FROM "Asset"
    WHERE "assetTag" LIKE ${`${base.replace(/[%_\\]/g, '\\$&')}%`}
      AND substring("assetTag" FROM ${base.length + 1}) ~ '^[0-9]{1,9}$'`;
  const first = (rows[0]?.max ?? 0) + 1;
  return Array.from({ length: count }, (_, index) => `${base}${String(first + index).padStart(5, '0')}`);
}
