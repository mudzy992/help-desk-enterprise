import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";

export function filterServiceCatalogRows(
  rows: readonly ServiceCatalogRow[],
  query: string,
): readonly ServiceCatalogRow[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return rows;
  }
  return rows.filter((row) => {
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
