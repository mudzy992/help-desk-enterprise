import { useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  listServicePage,
  type ServiceListQuery,
  type ServiceResponse,
} from "@/services/service-catalog-api";
import type { ServiceLifecycle } from "@/services/service-catalog-api";

export type ServiceCatalogRow = {
  readonly service: ServiceResponse;
};

export type ServiceCatalogFilters = {
  readonly query: string;
  readonly categoryId: string | null;
  readonly lifecycle: ServiceLifecycle | "ALL";
  readonly originUnitId: string | null;
};

export const serviceCatalogPageSize = 50;
export const serviceCatalogMaximumPages = 10;
export const serviceCatalogMaximumRows = serviceCatalogPageSize * serviceCatalogMaximumPages;

const emptyCatalogRows: readonly ServiceCatalogRow[] = [];

export type ServiceCatalogState = {
  readonly rows: readonly ServiceCatalogRow[];
  readonly totalCount: number;
  readonly hasMore: boolean;
  readonly reachedClientLimit: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isPlaceholderData: boolean;
  readonly hasLoaded: boolean;
  readonly isLoading: boolean;
  readonly errorKey: ApiErrorKey | null;
  readonly requestId: string | null;
  readonly reload: () => Promise<void>;
  readonly loadNextPage: () => Promise<void>;
};

/**
 * Katalog čita po 50 redova; maksimalno se može zadržati 500 redova u jednom
 * prikazu. Preko te granice UI upućuje korisnika na sužavanje filtera umjesto
 * da neprimjetno prikupi ili renderuje cijeli katalog.
 */
export function useServiceCatalog(filters: ServiceCatalogFilters): ServiceCatalogState {
  const normalizedFilters = {
    query: filters.query.trim(),
    categoryId: filters.categoryId,
    lifecycle: filters.lifecycle,
    originUnitId: filters.originUnitId,
  };
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.services, normalizedFilters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }): Promise<Awaited<ReturnType<typeof listServicePage>>> => {
      const request: ServiceListQuery = {
        take: serviceCatalogPageSize,
        cursor: pageParam,
        ...(normalizedFilters.query.length === 0 ? {} : { search: normalizedFilters.query }),
        ...(normalizedFilters.categoryId === null
          ? {}
          : { categoryId: normalizedFilters.categoryId }),
        ...(normalizedFilters.lifecycle === "ALL"
          ? {}
          : { lifecycle: normalizedFilters.lifecycle }),
        ...(normalizedFilters.originUnitId === null
          ? {}
          : { originUnitId: normalizedFilters.originUnitId }),
      };
      return listServicePage(request);
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    placeholderData: (previousData) => previousData,
    retry: false,
  });
  const pages = query.data?.pages ?? [];
  const pageLimitReached = pages.length >= serviceCatalogMaximumPages;
  const reachedClientLimit = pageLimitReached && query.hasNextPage;
  const rows =
    pages.length === 0
      ? emptyCatalogRows
      : pages.flatMap((page) => page.items.map((service) => ({ service })));
  const totalCount = pages[0]?.total ?? 0;
  const { refetch, fetchNextPage } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const loadNextPage = useCallback(async () => {
    if (
      query.hasNextPage &&
      !pageLimitReached &&
      !query.isFetchingNextPage &&
      !query.isPlaceholderData
    ) {
      await fetchNextPage();
    }
  }, [
    fetchNextPage,
    pageLimitReached,
    query.hasNextPage,
    query.isFetchingNextPage,
    query.isPlaceholderData,
  ]);

  return {
    rows,
    totalCount,
    hasMore: Boolean(query.hasNextPage && !pageLimitReached),
    reachedClientLimit,
    isFetchingNextPage: query.isFetchingNextPage,
    isPlaceholderData: query.isPlaceholderData,
    hasLoaded: query.data !== undefined,
    isLoading: query.isLoading,
    errorKey: query.error === null ? null : mapApiError(query.error),
    requestId: query.error === null ? null : readApiRequestId(query.error),
    reload,
    loadNextPage,
  };
}
