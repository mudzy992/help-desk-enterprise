import type { Prisma } from '../../generated/prisma/client';
import {
  formatDistinguishedName,
  parseDistinguishedName,
} from '../../common/ldap/rfc4514-distinguished-name';

/**
 * W2.36c: the manual catalogue and the real OU tree used to grow in two different
 * namespaces — `seed-database.ts` wrote `OU=Users,DC=example,DC=com`, while the
 * install wizard created `OU=Korisnici,DC=local`. A unit created next to the
 * catalogue row consequently got a DN no directory read would accept, and the
 * tree never received it.
 *
 * The tree is the authority: everything the operator adds must live in the
 * namespace the tree already uses. The suffix of an existing DN is the part after
 * its first RDN (`OU=Korisnici,DC=local` → `DC=local`).
 */
export function directoryNamespaceSuffixOf(
  distinguishedName: string,
): string | null {
  const relatives = parseDistinguishedName(distinguishedName);
  if (relatives.length <= 1) {
    return null;
  }
  return formatDistinguishedName(relatives.slice(1));
}

/**
 * Resolves the namespace new root units are created in. Deterministic under
 * competing suffixes: most used first, then the longer one (a deeper namespace
 * explains more of the tree), then alphabetical so two identical calls agree.
 */
export async function resolveDirectoryNamespaceSuffix(
  transaction: Prisma.TransactionClient,
): Promise<string | null> {
  const units = await transaction.organizationalUnit.findMany({
    select: { distinguishedName: true },
  });
  const counts = new Map<string, number>();
  for (const unit of units) {
    const suffix = directoryNamespaceSuffixOf(unit.distinguishedName);
    if (suffix === null) {
      continue;
    }
    counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    ([leftSuffix, leftCount], [rightSuffix, rightCount]) =>
      rightCount - leftCount ||
      rightSuffix.length - leftSuffix.length ||
      leftSuffix.localeCompare(rightSuffix),
  );
  return ranked[0]?.[0] ?? null;
}
