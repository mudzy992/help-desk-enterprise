import { buildCommercialListQuery, jsonBody } from "./http";
import { apiRequest } from "@/services/api";
import type { CursorPage } from "@/services/cursor-page";
import type { AssetContractLink } from "./commercial-types";
const contractPath = (id: string): string => `/assets/contracts/${encodeURIComponent(id)}`;

import type {
  AssetContractDetail,
  AssetContractInput,
  AssetContractItem,
  ContractListFilters,
} from "./commercial-types";

export function listContracts(
  filters: ContractListFilters,
): Promise<CursorPage<AssetContractItem>> {
  return apiRequest(`/assets/contracts${buildCommercialListQuery(filters)}`);
}

export function getContract(id: string): Promise<AssetContractDetail> {
  return apiRequest(contractPath(id));
}

export function listContractItems(
  id: string,
  cursor?: string,
  limit?: number,
): Promise<CursorPage<AssetContractDetail["items"][number]>> {
  const query = buildCommercialListQuery({ cursor, limit });
  return apiRequest(`${contractPath(id)}/items${query}`);
}

export function listAssetContractCoverage(
  assetId: string,
  cursor?: string,
  limit?: number,
): Promise<CursorPage<AssetContractLink>> {
  const query = buildCommercialListQuery({ cursor, limit });
  return apiRequest(`/assets/${encodeURIComponent(assetId)}/contracts${query}`);
}

export function createContract(input: AssetContractInput): Promise<{ readonly id: string }> {
  return apiRequest("/assets/contracts", { method: "POST", ...jsonBody(input) });
}

export function updateContract(id: string, input: AssetContractInput): Promise<unknown> {
  return apiRequest(contractPath(id), { method: "PUT", ...jsonBody(input) });
}

export function deleteContract(id: string): Promise<unknown> {
  return apiRequest(contractPath(id), { method: "DELETE" });
}

export function addContractItem(id: string, assetId: string): Promise<unknown> {
  return apiRequest(`${contractPath(id)}/items`, { method: "POST", ...jsonBody({ assetId }) });
}

export function removeContractItem(id: string, assetId: string): Promise<unknown> {
  return apiRequest(`${contractPath(id)}/items/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });
}

// ------------------------------------------------------------ import / export (requirement, requirement)
