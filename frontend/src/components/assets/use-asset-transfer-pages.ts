import { useInfiniteQuery } from "@tanstack/react-query";
import {
  assetTransferQueryKeys,
  listAssetTransfers,
  listAssetTransfersForAsset,
  listMyAssetTransfers,
  type AssetTransferFilters,
} from "@/services/asset-transfers-api";

export type AssetTransferPanelMode =
  | { readonly kind: "all" }
  | { readonly kind: "asset"; readonly assetId: string }
  | { readonly kind: "mine" };

export function useAssetTransferPages(mode: AssetTransferPanelMode, filters: AssetTransferFilters) {
  const registerQuery = useInfiniteQuery({
    queryKey: assetTransferQueryKeys.list(filters),
    queryFn: ({ pageParam }) => listAssetTransfers({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: mode.kind === "all",
    retry: false,
  });
  const scopedQuery = useInfiniteQuery({
    queryKey:
      mode.kind === "asset"
        ? assetTransferQueryKeys.forAsset(mode.assetId)
        : assetTransferQueryKeys.mine,
    queryFn: ({ pageParam }) =>
      mode.kind === "asset"
        ? listAssetTransfersForAsset(mode.assetId, pageParam)
        : listMyAssetTransfers(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: mode.kind !== "all",
    retry: false,
  });

  return {
    items:
      mode.kind === "all"
        ? (registerQuery.data?.pages.flatMap((page) => page.items) ?? [])
        : (scopedQuery.data?.pages.flatMap((page) => page.items) ?? []),
    loading: mode.kind === "all" ? registerQuery.isLoading : scopedQuery.isLoading,
    error: mode.kind === "all" ? registerQuery.error : scopedQuery.error,
    hasNextPage: mode.kind === "all" ? registerQuery.hasNextPage : scopedQuery.hasNextPage,
    isFetchingNextPage:
      mode.kind === "all" ? registerQuery.isFetchingNextPage : scopedQuery.isFetchingNextPage,
    fetchNextPage: mode.kind === "all" ? registerQuery.fetchNextPage : scopedQuery.fetchNextPage,
  };
}
