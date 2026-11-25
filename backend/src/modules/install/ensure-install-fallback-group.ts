import { PrismaService } from '../../common/prisma/prisma.service';
import { clearFallbackForOrganizationalUnit } from '../groups/clear-fallback-for-organizational-unit';
import { withGroupFallbackLock } from '../groups/with-group-fallback-lock';
import { defaultInstallSeedNames, type InstallSeedNames } from './install-seed.names';

export type InstallFallbackGroupRecord = {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly isFallback: boolean;
  readonly organizationalUnitId: string;
};

export type EnsuredInstallFallbackGroup = InstallFallbackGroupRecord & {
  readonly created: boolean;
};

export async function findInstallFallbackGroup(
  prisma: PrismaService,
  organizationalUnitId?: string,
  names: InstallSeedNames = defaultInstallSeedNames,
): Promise<InstallFallbackGroupRecord | null> {
  const scope =
    organizationalUnitId === undefined
      ? {}
      : { organizationalUnitId };
  const fallbackGroups = await prisma.group.findMany({
    where: { isFallback: true, ...scope },
    orderBy: { key: 'asc' },
  });
  const fallback = fallbackGroups[0];
  if (fallback !== undefined) {
    return toFallbackGroup(fallback);
  }
  const keyed = await prisma.group.findFirst({
    where: { key: names.fallbackGroupKey, ...scope },
    orderBy: { createdAt: 'asc' },
  });
  if (keyed !== null) {
    return toFallbackGroup(keyed);
  }
  if (organizationalUnitId !== undefined) {
    return findInstallFallbackGroup(prisma, undefined, names);
  }
  return null;
}

export async function ensureInstallFallbackGroup(
  prisma: PrismaService,
  input: {
    readonly organizationalUnitId: string;
    readonly preferredGroupId: string | null;
    readonly names?: InstallSeedNames;
  },
): Promise<EnsuredInstallFallbackGroup> {
  const names = input.names ?? defaultInstallSeedNames;
  const existing = await findInstallFallbackGroup(
    prisma,
    input.organizationalUnitId,
    names,
  );
  if (existing !== null) {
    if (existing.isFallback && existing.organizationalUnitId === input.organizationalUnitId) {
      return { ...existing, created: false };
    }
    const updated = await markGroupAsFallback(prisma, existing.id, input.organizationalUnitId);
    return { ...updated, created: false };
  }
  if (input.preferredGroupId !== null) {
    const updated = await markGroupAsFallback(prisma, input.preferredGroupId, input.organizationalUnitId);
    return { ...updated, created: false };
  }
  const created = await withGroupFallbackLock(prisma, input.organizationalUnitId, async () => {
    await clearFallbackForOrganizationalUnit(prisma, input.organizationalUnitId);
    return prisma.group.create({
      data: {
        name: names.fallbackGroupName,
        key: names.fallbackGroupKey,
        organizationalUnitId: input.organizationalUnitId,
        isFallback: true,
      },
    });
  });
  return { ...toFallbackGroup(created), created: true };
}

/**
 * W2.13 (`BA-groups-03`): the seed designates the group that will receive
 * unrouted tickets, and it may also move an existing fallback group into the
 * seeded unit. Both are fallback writes, so they take the same per-unit lock -
 * and they release any other fallback of the target unit first, because the
 * partial unique index allows exactly one per unit. Without that release the
 * seed would fail on the index (or, before the index existed, leave two).
 */
async function markGroupAsFallback(
  prisma: PrismaService,
  groupId: string,
  organizationalUnitId: string,
): Promise<InstallFallbackGroupRecord> {
  return withGroupFallbackLock(prisma, organizationalUnitId, async () => {
    await clearFallbackForOrganizationalUnit(prisma, organizationalUnitId, groupId);
    const updated = await prisma.group.update({
      where: { id: groupId },
      data: { isFallback: true, organizationalUnitId },
    });
    return toFallbackGroup(updated);
  });
}

function toFallbackGroup(group: {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly isFallback: boolean;
  readonly organizationalUnitId: string;
}): InstallFallbackGroupRecord {
  return {
    id: group.id,
    name: group.name,
    key: group.key,
    isFallback: group.isFallback,
    organizationalUnitId: group.organizationalUnitId,
  };
}
