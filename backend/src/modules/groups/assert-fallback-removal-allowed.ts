import type { PrismaService } from '../../common/prisma/prisma.service';
import { GroupsError } from './groups.error';

/**
 * W2.13 (`BA-groups-03`): the "at least one" half of the fallback policy.
 *
 * An organizational unit may start with no fallback group at all (fresh install,
 * or a unit that never routed unrouted tickets), so the policy is not "every unit
 * always has one". It is: **a write may not take a unit from one fallback group
 * to zero**. Unsetting the flag on the only fallback, or deleting it (W2.12),
 * needs a replacement first - the operator picks the new fallback in the same
 * gesture, which is what the replace semantics of `PATCH isFallback=true` do.
 *
 * Must be called while holding `withGroupFallbackLock` for the unit, otherwise
 * the count is just another read that another writer can invalidate.
 */
export async function assertFallbackRemovalAllowed(
  client: PrismaService,
  input: { readonly groupId: string; readonly organizationalUnitId: string },
): Promise<void> {
  const remaining = await client.group.count({
    where: {
      organizationalUnitId: input.organizationalUnitId,
      isFallback: true,
      id: { not: input.groupId },
    },
  });
  if (remaining === 0) {
    throw new GroupsError(
      'LAST_FALLBACK_GROUP',
      'LAST_FALLBACK_GROUP',
      undefined,
      { organizationalUnitId: input.organizationalUnitId },
    );
  }
}
