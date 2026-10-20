import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { queryKeys } from "@/lib/query/query-keys";
import {
  listServiceDowntimeWindows,
  type DowntimeWindowResponse,
} from "@/services/service-downtime-api";

const emptyWindows: readonly DowntimeWindowResponse[] = [];

export interface ServiceDowntimeWindowsState {
  readonly serviceId: string;
  readonly windows: readonly DowntimeWindowResponse[];
  readonly hasLoaded: boolean;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
}

export function useServiceDowntimeWindows(serviceId: string): ServiceDowntimeWindowsState {
  const query = useQuery({
    queryKey: queryKeys.serviceDowntimeWindows(serviceId),
    queryFn: () => listServiceDowntimeWindows(serviceId),
    retry: false,
  });
  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  return {
    serviceId,
    windows: query.data ?? emptyWindows,
    hasLoaded: query.data !== undefined,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && query.data !== undefined,
    errorKey: query.error === null ? null : mapApiError(query.error),
    requestId: query.error === null ? null : readApiRequestId(query.error),
    reload,
  };
}
