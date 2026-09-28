import type { PrismaService } from '../../../common/prisma/prisma.service';
import { computeTombstones, readTombstoneKey } from './tombstones';

type TombstoneReader = Pick<PrismaService, 'privacyErasure'>;

/**
 * Paket 2.6 (§6.4): builds a check "is this person an anonymized former
 * employee?" from the tombstones of completed erasures. Used by the AD sync
 * plan (exception RETURNING_ANONYMIZED) and Entra JIT (audit flag). The new
 * account is always created — the check only warns the admin.
 */
export async function loadReturningAnonymizedCheck(
  prisma: TombstoneReader,
): Promise<(identifiers: { readonly email?: string | null; readonly guid?: string | null; readonly oid?: string | null }) => boolean> {
  const key = readTombstoneKey();
  if (key === null) return () => false;
  const rows = await prisma.privacyErasure.findMany({
    where: { status: 'COMPLETED', NOT: { tombstones: { isEmpty: true } } },
    select: { tombstones: true },
  });
  const known = new Set(rows.flatMap((row) => row.tombstones));
  if (known.size === 0) return () => false;
  return (identifiers) =>
    computeTombstones(key, {
      email: identifiers.email,
      directoryObjectGuid: identifiers.guid,
      entraObjectId: identifiers.oid,
    }).some((value) => known.has(value));
}
