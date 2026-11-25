export type InMemoryInstallSeedGroup = {
  id: string;
  name: string;
  key: string;
  organizationalUnitId: string;
  isFallback: boolean;
  /** Optional: only the groups module's richer reads need them (F0.6). */
  isProblemGroup?: boolean;
  isCabGroup?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type GroupWhere = {
  /** W2.13: `clearFallbackForOrganizationalUnit` excludes one id via `{ not }`. */
  id?: string | { not?: string };
  key?: string;
  isFallback?: boolean;
  organizationalUnitId?: string;
};

export function createInMemoryInstallSeedGroupDelegate(
  groups: Map<string, InMemoryInstallSeedGroup>,
  nextId: () => string,
  now: () => Date,
) {
  return {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id?: string; key?: string };
      select?: Record<string, boolean>;
    }) => pickGroup(findGroup(groups, where), select),
    findFirst: async ({
      where,
      orderBy,
    }: {
      where?: GroupWhere;
      orderBy?: Record<string, 'asc' | 'desc'> | unknown;
    } = {}) => {
      const matches = [...groups.values()].filter((group) =>
        matchesGroup(group, where),
      );
      if (orderBy !== undefined && typeof orderBy === 'object' && orderBy !== null) {
        const key = Object.keys(orderBy as Record<string, unknown>)[0];
        const direction = (orderBy as Record<string, 'asc' | 'desc'>)[key ?? ''];
        const field = (key as keyof InMemoryInstallSeedGroup) ?? 'createdAt';
        matches.sort((left, right) => {
          const comparison = compareGroupValues(left[field], right[field]);
          return direction === 'desc' ? -comparison : comparison;
        });
      }
      return matches[0] ?? null;
    },
    findMany: async ({
      where,
    }: {
      where?: GroupWhere;
    } = {}) =>
      [...groups.values()]
        .filter((group) => matchesGroup(group, where))
        .sort((left, right) => left.key.localeCompare(right.key)),
    create: async ({
      data,
    }: {
      data: Omit<InMemoryInstallSeedGroup, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      };
    }) => {
      if ([...groups.values()].some((group) => group.key === data.key)) {
        throw { code: 'P2002', meta: { target: ['key'] } };
      }
      const created: InMemoryInstallSeedGroup = {
        id: data.id ?? nextId(),
        name: data.name,
        key: data.key,
        organizationalUnitId: data.organizationalUnitId,
        isFallback: data.isFallback,
        isProblemGroup: data.isProblemGroup ?? false,
        isCabGroup: data.isCabGroup ?? false,
        createdAt: now(),
        updatedAt: now(),
      };
      groups.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<InMemoryInstallSeedGroup>;
    }) => {
      const current = groups.get(where.id);
      if (current === undefined) {
        return null;
      }
      const updated = { ...current, ...data, updatedAt: now() };
      groups.set(where.id, updated);
      return updated;
    },
    // W2.13 (`BA-groups-03`): designating the fallback group releases every other
    // fallback of the unit through `updateMany`, so the seed's fake client has to
    // support the same two calls the real one does.
    count: async ({ where }: { where?: GroupWhere } = {}) =>
      [...groups.values()].filter((group) => matchesGroup(group, where)).length,
    updateMany: async ({
      where,
      data,
    }: {
      where?: GroupWhere;
      data: Partial<InMemoryInstallSeedGroup>;
    }) => {
      let count = 0;
      for (const group of [...groups.values()]) {
        if (!matchesGroup(group, where)) {
          continue;
        }
        groups.set(group.id, { ...group, ...data, updatedAt: now() });
        count += 1;
      }
      return { count };
    },
  };
}

function findGroup(
  groups: Map<string, InMemoryInstallSeedGroup>,
  where: { id?: string; key?: string },
): InMemoryInstallSeedGroup | undefined {
  if (where.id !== undefined) {
    return groups.get(where.id);
  }
  return [...groups.values()].find((group) => group.key === where.key);
}

function matchesGroup(
  group: InMemoryInstallSeedGroup,
  where?: GroupWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (where.id !== undefined) {
    if (typeof where.id === 'string') {
      if (group.id !== where.id) return false;
    } else if (where.id.not !== undefined && group.id === where.id.not) {
      return false;
    }
  }
  if (where.key !== undefined && group.key !== where.key) {
    return false;
  }
  if (
    where.isFallback !== undefined &&
    group.isFallback !== where.isFallback
  ) {
    return false;
  }
  return (
    where.organizationalUnitId === undefined ||
    group.organizationalUnitId === where.organizationalUnitId
  );
}

function pickGroup(
  group: InMemoryInstallSeedGroup | undefined,
  select?: Record<string, boolean>,
): InMemoryInstallSeedGroup | Record<string, unknown> | null {
  if (group === undefined) {
    return null;
  }
  if (select === undefined) {
    return group;
  }
  const picked: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      picked[key] = group[key as keyof InMemoryInstallSeedGroup];
    }
  }
  return picked;
}

function compareGroupValues(left: unknown, right: unknown): number {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  return String(left ?? '').localeCompare(String(right ?? ''));
}
