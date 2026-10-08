import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceLifecycle } from "@/services/service-catalog-api";

export type ServiceCatalogFilters = {
  readonly query: string;
  readonly categoryId: string | null;
  readonly lifecycle: ServiceLifecycle | null;
  readonly originUnitId: string | null;
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly serviceIdsWithExactRuleByOriginUnit: ReadonlyMap<string, ReadonlySet<string>>;
};

export function filterServiceCatalogRows(
  rows: readonly ServiceCatalogRow[],
  filters: ServiceCatalogFilters,
): readonly ServiceCatalogRow[] {
  const needle = normalizeServiceSearch(filters.query.trim());
  const servicesWithExactRule =
    filters.originUnitId === null
      ? null
      : filters.serviceIdsWithExactRuleByOriginUnit.get(filters.originUnitId) ?? new Set<string>();

  return rows.filter((row) => {
    if (filters.categoryId !== null && row.service.categoryId !== filters.categoryId) {
      return false;
    }
    if (filters.lifecycle !== null && row.service.lifecycle !== filters.lifecycle) {
      return false;
    }
    if (servicesWithExactRule !== null && !servicesWithExactRule.has(row.service.id)) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }

    const categoryName =
      filters.categoryNames.get(row.service.categoryId) ?? row.service.category?.name ?? "";
    return [row.service.name, row.service.slug, categoryName].some((value) =>
      normalizeServiceSearch(value).includes(needle),
    );
  });
}

/** Makes service search forgiving of Bosnian/Croatian/Serbian diacritics. */
export function normalizeServiceSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function shouldWarnServiceRuntimeAvailability(
  isCurrentlyUnavailable: boolean,
  hasActiveDowntime: boolean,
): boolean {
  return isCurrentlyUnavailable || hasActiveDowntime;
}

export function countServicesInCategory(
  rows: readonly ServiceCatalogRow[],
  categoryId: string,
): number {
  return rows.filter((row) => row.service.categoryId === categoryId).length;
}
