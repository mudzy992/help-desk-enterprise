import { PrismaService } from '../../common/prisma/prisma.service';
import { installSeedConstants } from './install-seed.constants';

export type InstallFallbackGroupRecord = {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly isFallback: boolean;
};

export type EnsuredInstallFallbackGroup = InstallFallbackGroupRecord & {
  readonly created: boolean;
};

export async function findInstallFallbackGroup(
  prisma: PrismaService,
): Promise<InstallFallbackGroupRecord | null> {
  const fallbackGroups = await prisma.group.findMany({
    where: { isFallback: true },
    orderBy: { key: 'asc' },
  });
  const fallback = fallbackGroups[0];
  if (fallback !== undefined) {
    return toFallbackGroup(fallback);
  }
  const keyed = await prisma.group.findUnique({
    where: { key: installSeedConstants.fallbackGroupKey },
  });
  return keyed === null ? null : toFallbackGroup(keyed);
}

export async function ensureInstallFallbackGroup(
  prisma: PrismaService,
  input: {
    readonly organizationalUnitId: string;
    readonly preferredGroupId: string | null;
  },
): Promise<EnsuredInstallFallbackGroup> {
  const existing = await findInstallFallbackGroup(prisma);
  if (existing !== null) {
    if (existing.isFallback) {
      return { ...existing, created: false };
    }
    return {
      ...(await markGroupAsFallback(prisma, existing.id)),
      created: false,
    };
  }
  if (input.preferredGroupId !== null) {
    return {
      ...(await markGroupAsFallback(prisma, input.preferredGroupId)),
      created: false,
    };
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
): Promise<InstallFallbackGroupRecord> {
  const updated = await prisma.group.update({
    where: { id: groupId },
    data: { isFallback: true },
  });
  return toFallbackGroup(updated);
}

function toFallbackGroup(group: {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly isFallback: boolean;
}): InstallFallbackGroupRecord {
  return {
    id: group.id,
    name: group.name,
    key: group.key,
    isFallback: group.isFallback,
  };
}
