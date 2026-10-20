import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { queryKeys } from "@/lib/query/query-keys";
import {
  listServiceCategories,
  type ServiceCategoryResponse,
} from "@/services/service-categories-api";

const emptyCategories: readonly ServiceCategoryResponse[] = [];

export function useServiceCategories() {
  const query = useQuery({
    queryKey: queryKeys.serviceCategories,
    queryFn: listServiceCategories,
    retry: false,
  });
  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const errorKey: ApiErrorKey | null = query.error === null ? null : mapApiError(query.error);
  return {
    categories: query.data ?? emptyCategories,
    hasLoaded: query.data !== undefined,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && query.data !== undefined,
    errorKey,
    requestId: query.error === null ? null : readApiRequestId(query.error),
    reload,
  };
}
