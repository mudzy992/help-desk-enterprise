export type InMemoryOrganizationalUnitWhere = {
  id?: string;
  parentId?: string | null;
  distinguishedName?: string | { equals: string; mode?: string };
  ouPath?: string | { startsWith?: string; in?: readonly string[] };
  OR?: InMemoryOrganizationalUnitWhere[];
  NOT?: { id?: string | { in?: readonly string[] } };
};

export function matchesInMemoryOrganizationalUnitWhere(
  unit: {
    readonly id: string;
    readonly parentId: string | null;
    readonly distinguishedName: string;
    readonly ouPath: string;
  },
  where: InMemoryOrganizationalUnitWhere,
): boolean {
  if (where.OR !== undefined) {
    const matchesOr = where.OR.some((clause) =>
      matchesInMemoryOrganizationalUnitWhere(unit, clause),
    );
    if (!matchesOr) {
      return false;
    }
  }
  if (where.NOT !== undefined) {
    const excluded = where.NOT.id;
    if (typeof excluded === 'string' && unit.id === excluded) {
      return false;
    }
    if (
      typeof excluded === 'object' &&
      excluded.in !== undefined &&
      excluded.in.includes(unit.id)
    ) {
      return false;
    }
  }
  if (where.id !== undefined && unit.id !== where.id) {
    return false;
  }
  if (where.parentId !== undefined && unit.parentId !== where.parentId) {
    return false;
  }
  return (
    matchesStringFilter(unit.distinguishedName, where.distinguishedName) &&
    matchesStringFilter(unit.ouPath, where.ouPath)
  );
}

export function pickSelectedFields<T extends object>(
  record: T,
  select: Record<string, boolean>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      picked[key] = record[key as keyof T];
    }
  }
  return picked;
}

function matchesStringFilter(
  value: string,
  filter:
    | string
    | { equals?: string; startsWith?: string; in?: readonly string[]; mode?: string }
    | undefined,
): boolean {
  if (filter === undefined) {
    return true;
  }
  if (typeof filter === 'string') {
    return value === filter;
  }
  if (filter.equals !== undefined) {
    return filter.mode === 'insensitive'
      ? value.toLowerCase() === filter.equals.toLowerCase()
      : value === filter.equals;
  }
  if (filter.startsWith !== undefined && !value.startsWith(filter.startsWith)) {
    return false;
  }
  return filter.in === undefined || filter.in.includes(value);
}
