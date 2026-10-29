import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { queryKeys } from "@/lib/query/query-keys";
import {
  buildCatalogRoutingIndex,
  type CatalogRoutingIndex,
} from "@/lib/services/catalog-routing-index";
import { loadCatalogRoutingCoverage } from "@/lib/services/load-catalog-routing-coverage";

export type CatalogRoutingCoverageState = CatalogRoutingIndex & {
  readonly hasLoaded: boolean;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isAvailable: boolean;
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
};

const emptyIndex: CatalogRoutingIndex = {
  notesByServiceId: new Map(),
  originUnits: [],
  serviceIdsWithExactRuleByOriginUnit: new Map(),
};

export function useCatalogRoutingCoverage(): CatalogRoutingCoverageState {
  const query = useQuery({
    queryKey: queryKeys.serviceRoutingCoverage,
    queryFn: async () => buildCatalogRoutingIndex(await loadCatalogRoutingCoverage()),
    retry: false,
  });
  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const index = query.data ?? emptyIndex;
  return {
    ...index,
    hasLoaded: query.data !== undefined,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && query.data !== undefined,
    isAvailable: query.data !== undefined,
    errorKey: query.error === null ? null : mapApiError(query.error),
    requestId: query.error === null ? null : readApiRequestId(query.error),
    reload,
  };
}
