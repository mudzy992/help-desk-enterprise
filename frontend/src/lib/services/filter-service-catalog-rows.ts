import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";

export function filterServiceCatalogRows(
  rows: readonly ServiceCatalogRow[],
  query: string,
  categoryId: string | null = null,
): readonly ServiceCatalogRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (categoryId !== null && row.service.categoryId !== categoryId) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }
    const name = row.service.name.toLowerCase();
    const slug = row.service.slug.toLowerCase();
    return name.includes(needle) || slug.includes(needle);
  });
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
