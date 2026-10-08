import type { ServiceResponse } from "@/services/service-catalog-api";

/**
 * Paket 5.3.1 (D9): pure model of the create-ticket "Service" step —
 * search (diacritic-insensitive), category chips with counts, groups ordered
 * like the catalog, and a "recently used" group on top. Kept free of React so
 * the rules are unit tested (`service-picker-model.spec.ts`).
 */
export const uncategorizedKey = "__none__";
export const recentGroupKey = "__recent__";
export const maxRecentServices = 5;

export type ServicePickerGroup = {
  /** Category id, `uncategorizedKey` or `recentGroupKey`. */
  readonly key: string;
  /** Display name; `null` for the synthetic groups (the UI translates them). */
  readonly name: string | null;
  readonly services: readonly ServiceResponse[];
};

export type ServicePickerChip = {
  readonly key: string;
  readonly name: string | null;
  readonly count: number;
};

/** Lower-case, strips diacritics and maps đ → d so "sifra" finds "Šifra". */
export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

function categoryKey(service: ServiceResponse): string {
  return service.category == null ? uncategorizedKey : service.categoryId;
}

export function matchesServiceQuery(service: ServiceResponse, query: string): boolean {
  const needle = foldSearchText(query);
  if (needle === "") return true;
  const haystack = foldSearchText(
    `${service.name} ${service.slug.replace(/-/g, " ")} ${service.category?.name ?? ""}`,
  );
  // Every word must match somewhere ("vpn pristup" ≈ "Pristup VPN-u").
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

function compareGroups(left: ServicePickerGroup & { sort: number }, right: ServicePickerGroup & { sort: number }): number {
  if (left.key === uncategorizedKey) return 1;
  if (right.key === uncategorizedKey) return -1;
  return left.sort - right.sort || (left.name ?? "").localeCompare(right.name ?? "");
}

/** Category chips over the services that match the query (counts follow the search). */
export function buildServiceChips(
  services: readonly ServiceResponse[],
  query: string,
): readonly ServicePickerChip[] {
  const byKey = new Map<string, ServicePickerChip & { sort: number; services: ServiceResponse[] }>();
  for (const service of services) {
    if (!matchesServiceQuery(service, query)) continue;
    const key = categoryKey(service);
    const entry = byKey.get(key) ?? {
      key,
      name: service.category?.name ?? null,
      sort: service.category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      count: 0,
      services: [],
    };
    byKey.set(key, { ...entry, count: entry.count + 1 });
  }
  return [...byKey.values()]
    .sort(compareGroups)
    .map(({ key, name, count }) => ({ key, name, count }));
}

export function buildServiceGroups(input: {
  readonly services: readonly ServiceResponse[];
  readonly query: string;
  readonly categoryKey: string | null;
  readonly recentIds: readonly string[];
}): readonly ServicePickerGroup[] {
  const visible = input.services.filter(
    (service) =>
      matchesServiceQuery(service, input.query) &&
      (input.categoryKey === null || categoryKey(service) === input.categoryKey),
  );
  const groups = new Map<string, ServicePickerGroup & { sort: number; services: ServiceResponse[] }>();
  for (const service of visible) {
    const key = categoryKey(service);
    const group = groups.get(key) ?? {
      key,
      name: service.category?.name ?? null,
      sort: service.category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      services: [],
    };
    group.services.push(service);
    groups.set(key, group);
  }
  const ordered: ServicePickerGroup[] = [...groups.values()]
    .sort(compareGroups)
    .map(({ key, name, services }) => ({
      key,
      name,
      services: [...services].sort((left, right) => left.name.localeCompare(right.name)),
    }));

  // "Recently used" only on the untouched list: once the user searches or
  // narrows by category, duplicates on top would just be noise.
  if (input.query.trim() === "" && input.categoryKey === null && input.recentIds.length > 0) {
    const byId = new Map(input.services.map((service) => [service.id, service]));
    const recent = input.recentIds
      .map((id) => byId.get(id))
      .filter((service): service is ServiceResponse => service !== undefined)
      .slice(0, maxRecentServices);
    if (recent.length > 0) {
      ordered.unshift({ key: recentGroupKey, name: null, services: recent });
    }
  }
  return ordered;
}

/** Most-recent-first list of ids with `serviceId` moved to the front. */
export function pushRecentService(recentIds: readonly string[], serviceId: string): readonly string[] {
  return [serviceId, ...recentIds.filter((id) => id !== serviceId)].slice(0, maxRecentServices);
}
