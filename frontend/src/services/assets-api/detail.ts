import { assetPath, jsonBody } from "./http";
import { apiRequest } from "@/services/api";
import type {
  AssetAttributeInput,
  AssetDetail,
  AssetHistory,
  AssetImpact,
  AssetLocationInput,
  AssetRelationKind,
  AssetStatus,
  AssetTypeInput,
  AssetWriteInput,
} from "./types";

export function getAsset(id: string): Promise<AssetDetail> {
  return apiRequest<AssetDetail>(assetPath(id));
}

export function createAsset(input: AssetWriteInput): Promise<{ readonly id: string }> {
  return apiRequest("/assets", { method: "POST", ...jsonBody(input) });
}

export function updateAsset(id: string, input: AssetWriteInput): Promise<unknown> {
  return apiRequest(assetPath(id), { method: "PUT", ...jsonBody(input) });
}

export function deleteAsset(id: string): Promise<void> {
  return apiRequest<void>(assetPath(id), { method: "DELETE" });
}

export function changeAssetStatus(
  id: string,
  status: AssetStatus,
  reason?: string,
): Promise<unknown> {
  return apiRequest(`${assetPath(id)}/status`, {
    method: "POST",
    ...jsonBody({ status, reason: reason || undefined }),
  });
}

export function assignAsset(id: string, userId: string, note?: string): Promise<unknown> {
  return apiRequest(`${assetPath(id)}/assign`, {
    method: "POST",
    ...jsonBody({ userId, note: note || undefined }),
  });
}

export function unassignAsset(
  id: string,
  status: "IN_STOCK" | "IN_REPAIR",
  note?: string,
): Promise<unknown> {
  return apiRequest(`${assetPath(id)}/unassign`, {
    method: "POST",
    ...jsonBody({ status, note: note || undefined }),
  });
}

export function getAssetHistory(id: string, cursor?: string): Promise<AssetHistory> {
  return apiRequest<AssetHistory>(
    `${assetPath(id)}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}

export function getAssetImpact(id: string): Promise<AssetImpact> {
  return apiRequest<AssetImpact>(`${assetPath(id)}/impact`);
}

export function addAssetRelation(
  id: string,
  toAssetId: string,
  kind: AssetRelationKind,
): Promise<{ readonly id: string }> {
  return apiRequest(`${assetPath(id)}/relations`, {
    method: "POST",
    ...jsonBody({ toAssetId, kind }),
  });
}

export function removeAssetRelation(id: string, relationId: string): Promise<void> {
  return apiRequest<void>(`${assetPath(id)}/relations/${encodeURIComponent(relationId)}`, {
    method: "DELETE",
  });
}

export function createAssetType(input: AssetTypeInput): Promise<unknown> {
  return apiRequest("/assets/catalog/types", { method: "POST", ...jsonBody(input) });
}

export function updateAssetType(id: string, input: AssetTypeInput): Promise<unknown> {
  return apiRequest(`/assets/catalog/types/${encodeURIComponent(id)}`, {
    method: "PUT",
    ...jsonBody(input),
  });
}

export function setAssetTypeArchived(id: string, archived: boolean): Promise<unknown> {
  return apiRequest(`/assets/catalog/types/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    ...jsonBody({ archived }),
  });
}

export function createAssetAttribute(typeId: string, input: AssetAttributeInput): Promise<unknown> {
  return apiRequest(`/assets/catalog/types/${encodeURIComponent(typeId)}/attributes`, {
    method: "POST",
    ...jsonBody(input),
  });
}

export function updateAssetAttribute(id: string, input: AssetAttributeInput): Promise<unknown> {
  return apiRequest(`/assets/catalog/attributes/${encodeURIComponent(id)}`, {
    method: "PUT",
    ...jsonBody(input),
  });
}

export function setAssetAttributeArchived(id: string, archived: boolean): Promise<unknown> {
  return apiRequest(`/assets/catalog/attributes/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    ...jsonBody({ archived }),
  });
}

export function createAssetLocation(input: AssetLocationInput): Promise<unknown> {
  return apiRequest("/assets/catalog/locations", { method: "POST", ...jsonBody(input) });
}

export function updateAssetLocation(id: string, input: AssetLocationInput): Promise<unknown> {
  return apiRequest(`/assets/catalog/locations/${encodeURIComponent(id)}`, {
    method: "PUT",
    ...jsonBody(input),
  });
}

export function setAssetLocationArchived(id: string, archived: boolean): Promise<unknown> {
  return apiRequest(`/assets/catalog/locations/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    ...jsonBody({ archived }),
  });
}

/** Delivery invariant (requirement): the requester's own equipment for the create form. */
