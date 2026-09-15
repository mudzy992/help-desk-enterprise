import type { RoutingCoverageItem } from "@/services/routing-api";

export type CatalogCoverageNote = {
  readonly tone: "warning" | "success";
  readonly key: "services.coverageUnrouted" | "services.coverageOk";
};

export function catalogCoverageNote(
  items: readonly RoutingCoverageItem[],
  serviceId: string,
): CatalogCoverageNote | null {
  const forService = items.filter((item) => item.serviceId === serviceId);
  if (forService.length === 0) {
    return null;
  }
  const hasUnrouted = forService.some(
    (item) => item.resolution.outcome === "UNROUTED",
  );
  if (hasUnrouted) {
    return { tone: "warning", key: "services.coverageUnrouted" };
  }
  return { tone: "success", key: "services.coverageOk" };
}
