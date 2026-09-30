import { useQuery } from "@tanstack/react-query";
import { assetQueryKeys, getAssetCapabilities } from "@/services/assets-api";

/**
 * Paket 3.2 C9c: physical locations are optional (`private.assets.locations.enabled`,
 * off by default). Reads the cached capabilities; while unknown, locations stay hidden.
 */
export function useAssetLocationsEnabled(): boolean {
  const query = useQuery({ queryKey: assetQueryKeys.capabilities, queryFn: getAssetCapabilities, retry: false, staleTime: 60_000 });
  return query.data?.locationsEnabled === true;
}
