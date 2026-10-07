import { PrismaService } from '../../common/prisma/prisma.service';
import { installSeedConstants } from './install-seed.constants';

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
    where: { key: installSeedConstants.fallbackGroupKey, ...scope },
    orderBy: { createdAt: 'asc' },
  });
  if (keyed !== null) {
    return toFallbackGroup(keyed);
  }
  if (organizationalUnitId !== undefined) {
    return findInstallFallbackGroup(prisma);
  }
  return null;
}

export async function ensureInstallFallbackGroup(
  prisma: PrismaService,
  input: {
    readonly organizationalUnitId: string;
    readonly preferredGroupId: string | null;
  },
): Promise<EnsuredInstallFallbackGroup> {
  const existing = await findInstallFallbackGroup(
    prisma,
    input.organizationalUnitId,
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
  const created = await prisma.group.create({
    data: {
      name: installSeedConstants.fallbackGroupName,
      key: installSeedConstants.fallbackGroupKey,
      organizationalUnitId: input.organizationalUnitId,
      isFallback: true,
    },
  });
  return { ...toFallbackGroup(created), created: true };
}

async function markGroupAsFallback(
  prisma: PrismaService,
  groupId: string,
  organizationalUnitId: string,
): Promise<InstallFallbackGroupRecord> {
  const updated = await prisma.group.update({
    where: { id: groupId },
    data: { isFallback: true, organizationalUnitId },
  });
  return toFallbackGroup(updated);
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
