import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * W2.13 (`BA-groups-03`): "which group is the fallback of this unit" is a
 * read-modify-write. Two requests that both read `isFallback = true` for
 * different groups, or a delete that counts fallbacks while another request
 * unsets the last one, used to interleave freely - the schema had no constraint
 * to fall back on, so an OU could end up with zero or two fallback groups.
 *
 * Every writer that can change the fallback flag of an OU now takes this
 * transaction-scoped advisory lock first:
 *
 *  - `createGroup` (only when it creates a fallback),
 *  - `updateGroup` (only when it toggles the flag),
 *  - `deleteGroup` (the inventory counts fallback groups),
 *  - the install seed when it designates or moves the fallback group.
 *
 * The lock is keyed by organizational unit, so unrelated OUs still write in
 * parallel. It is taken *inside* the transaction: `pg_advisory_xact_lock`
 * releases on commit or rollback, so a failed request cannot wedge the OU.
 * The partial unique index from the same package is the second line of defence,
 * for writers that bypass this module.
 */
export async function withGroupFallbackLock<T>(
  client: PrismaService,
  organizationalUnitId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockKey = fallbackLockKey(organizationalUnitId);
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  return operation();
}

/**
 * Exported for tests and for operators reading `pg_locks`: the key is stable per
 * organizational unit and cannot collide across unrelated namespaces because it
 * carries its own prefix.
 */
export function fallbackLockKey(organizationalUnitId: string): string {
  return `group-fallback:${organizationalUnitId}`;
}
