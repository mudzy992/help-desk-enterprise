import { apiRequest } from "@/services/api";
import type {
  AssetCapabilities,
  AssetCatalog,
  AssetList,
  AssetListItem,
  AssetListFilters,
  AssetOptions,
  AssetUserSummary,
  MyAsset,
  AssetStatus,
} from "./types";

export function buildAssetListQuery(filters: AssetListFilters): string {
  const params = new URLSearchParams();
  if (filters.search && filters.search.trim().length > 0)
    params.set("search", filters.search.trim());
  if (filters.typeId) params.set("typeId", filters.typeId);
  if (filters.status && filters.status.length > 0) params.set("status", filters.status.join(","));
  if (filters.organizationalUnitId)
    params.set("organizationalUnitId", filters.organizationalUnitId);
  if (filters.locationId) params.set("locationId", filters.locationId);
  if (filters.unassigned) params.set("unassigned", "true");
  if (filters.warrantyWithinDays !== undefined)
    params.set("warrantyWithinDays", String(filters.warrantyWithinDays));
  if (filters.source) params.set("source", filters.source);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

export function getAssetCapabilities(): Promise<AssetCapabilities> {
  return apiRequest<AssetCapabilities>("/assets/capabilities");
}

export function getAssetCatalog(includeArchived = false): Promise<AssetCatalog> {
  return apiRequest<AssetCatalog>(
    `/assets/catalog${includeArchived ? "?includeArchived=true" : ""}`,
  );
}

export function getAssetOptions(): Promise<AssetOptions> {
  return apiRequest<AssetOptions>("/assets/options");
}

export function searchAssetUsers(
  search: string,
): Promise<{ readonly items: readonly AssetUserSummary[] }> {
  return apiRequest(`/assets/users?search=${encodeURIComponent(search)}`);
}

export function listAssets(filters: AssetListFilters): Promise<AssetList> {
  return apiRequest<AssetList>(`/assets${buildAssetListQuery(filters)}`);
}

export function lookupAssets(
  search: string,
  excludeId?: string,
): Promise<{ readonly items: readonly AssetListItem[] }> {
  const exclude = excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : "";
  return apiRequest(`/assets/lookup?search=${encodeURIComponent(search)}${exclude}`);
}

/** C9b: asset manager overview (asset.report.read, unit scope). */
export type AssetOverview = {
  readonly generatedAt: string;
  readonly byStatus: readonly { readonly status: AssetStatus; readonly count: number }[];
  readonly expiring: {
    readonly days: number;
    readonly total: number;
    readonly items: readonly {
      readonly kind: "warranty" | "contract" | "license";
      readonly name: string;
      readonly reference: string | null;
      readonly unitName: string;
      readonly endsAt: string;
    }[];
  };
  readonly overAllocatedLicenses: {
    readonly total: number;
    readonly items: readonly {
      readonly productName: string;
      readonly unitName: string;
      readonly seats: number | null;
      readonly used: number;
    }[];
  };
  readonly topAssets: {
    readonly days: number;
    readonly items: readonly {
      readonly assetId: string;
      readonly assetTag: string;
      readonly assetName: string;
      readonly typeName: string;
      readonly unitName: string;
      readonly tickets: number;
      readonly openTickets: number;
    }[];
  };
  readonly directory: { readonly suggested: number; readonly missing: number };
  readonly holders: {
    readonly total: number;
    readonly items: readonly {
      readonly assetTag: string;
      readonly assetName: string;
      readonly holderName: string;
      readonly reason: "inactive" | "other_unit";
      readonly holderUnitName: string | null;
      readonly assetUnitName: string;
    }[];
  };
};

export function getAssetOverview(): Promise<AssetOverview> {
  return apiRequest("/assets/overview");
}

export function getMyAssets(): Promise<{ readonly items: readonly MyAsset[] }> {
  return apiRequest("/assets/mine");
}
