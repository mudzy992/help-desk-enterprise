import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { loadVisibleOnboardings } from "@/lib/services/load-visible-onboardings";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceOnboardingResponse } from "@/services/service-onboarding-api";

const emptyOnboardings: readonly ServiceOnboardingResponse[] = [];

export function useVisibleOnboardings(rows: readonly ServiceCatalogRow[]) {
  const draftIds = rows
    .filter((row) => row.service.lifecycle === "DRAFT")
    .map((row) => row.service.id)
    .sort();
  const draftKey = draftIds.join("\u0000");
  const query = useQuery({
    queryKey: queryKeys.serviceOnboardings(draftKey),
    queryFn: () => loadVisibleOnboardings(draftIds),
    enabled: draftIds.length > 0,
    retry: false,
  });
  return draftIds.length === 0 ? emptyOnboardings : (query.data ?? emptyOnboardings);
}
