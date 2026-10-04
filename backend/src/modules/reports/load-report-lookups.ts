import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Batch lookups behind the human-readable names in report payloads.
 *
 * Val 1 (M15/B2, M9/B3): both `/reports/bottlenecks` and
 * `/tickets/csat/summary` used to return only the raw keys (`originUnitId`,
 * `serviceId`, `priority`, `assignedGroupId`), so the new tabs printed IDs to
 * administrators. The names are resolved here — on the server, in one query per
 * kind — and returned next to the key; the client never needs to own a catalog
 * just to draw a label.
 *
 * Every loader is defensive: a missing delegate (in-memory test clients) or an
 * id that no longer exists means „no label“, and the caller falls back to the
 * key, never to a blank.
 */
export async function loadOrganizationalUnitNames(
  prisma: PrismaService,
  unitIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  if (typeof prisma.organizationalUnit?.findMany !== 'function') {
    return new Map();
  }
  const uniqueIds = unique(unitIds);
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const units = (await prisma.organizationalUnit.findMany({
    where: { id: { in: [...uniqueIds] } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name?: string }>;
  return new Map(
    units
      .filter((unit) => typeof unit.name === 'string' && unit.name.length > 0)
      .map((unit) => [unit.id, unit.name as string]),
  );
}

export async function loadServiceNames(
  prisma: PrismaService,
  serviceIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  if (typeof prisma.service?.findMany !== 'function') {
    return new Map();
  }
  const uniqueIds = unique(serviceIds);
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const services = (await prisma.service.findMany({
    where: { id: { in: [...uniqueIds] } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name?: string }>;
  return new Map(
    services
      .filter((service) => typeof service.name === 'string' && service.name.length > 0)
      .map((service) => [service.id, service.name as string]),
  );
}

export async function loadGroupNames(
  prisma: PrismaService,
  groupIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  if (typeof prisma.group?.findMany !== 'function') {
    return new Map();
  }
  const uniqueIds = unique(groupIds);
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const groups = (await prisma.group.findMany({
    where: { id: { in: [...uniqueIds] } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name?: string }>;
  return new Map(
    groups
      .filter((group) => typeof group.name === 'string' && group.name.length > 0)
      .map((group) => [group.id, group.name as string]),
  );
}

export async function loadUserNames(
  prisma: PrismaService,
  userIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  if (typeof prisma.user?.findMany !== 'function') {
    return new Map();
  }
  const uniqueIds = unique(userIds);
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const users = (await prisma.user.findMany({
    where: { id: { in: [...uniqueIds] } },
    select: { id: true, displayName: true },
  })) as Array<{ id: string; displayName?: string }>;
  return new Map(
    users
      .filter(
        (user) => typeof user.displayName === 'string' && user.displayName.length > 0,
      )
      .map((user) => [user.id, user.displayName as string]),
  );
}

function unique(values: readonly (string | null)[]): string[] {
  return [
    ...new Set(values.filter((id): id is string => id !== null && id.length > 0)),
  ];
}
