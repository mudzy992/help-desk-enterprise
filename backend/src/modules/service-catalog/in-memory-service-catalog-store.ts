export type InMemorySlugRecord = {
  readonly id: string;
  readonly slug: string;
};

export type ServiceDependents = {
  tickets: number;
  formVersions: number;
  routingRules: number;
  userRoles: number;
};

export function findByIdOrSlug<T extends InMemorySlugRecord>(
  records: Map<string, T>,
  where: { id?: string; slug?: string },
): T | null {
  if (where.id !== undefined) {
    return records.get(where.id) ?? null;
  }
  return [...records.values()].find((item) => item.slug === where.slug) ?? null;
}

export function assertUniqueSlug<T extends InMemorySlugRecord>(
  records: Map<string, T>,
  slug: string,
): void {
  for (const record of records.values()) {
    if (record.slug === slug) {
      throw { code: 'P2002', meta: { target: ['slug'] } };
    }
  }
}

export function pickSelectedFields<T extends object>(
  record: T,
  select: Record<string, unknown>,
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    selected[key] = (record as Record<string, unknown>)[key];
  }
  return selected;
}

export function emptyServiceDependents(): ServiceDependents {
  return {
    tickets: 0,
    formVersions: 0,
    routingRules: 0,
    userRoles: 0,
  };
}
