import { buildCommercialListQuery, jsonBody } from "./http";
import { apiRequest } from "@/services/api";
import type { AssetUserSummary } from "./types";
import type { CursorPage } from "@/services/cursor-page";
import type {
  AssetLicenseLink,
  ContractListFilters,
  LicenseListFilters,
  SoftwareLicenseAssignment,
  SoftwareLicenseDetail,
  SoftwareLicenseInput,
  SoftwareLicenseItem,
} from "./commercial-types";

export const assetContractQueryKeys = {
  licenses: (filters: LicenseListFilters) => ["assets", "licenses", filters] as const,
  license: (id: string) => ["assets", "license", id] as const,
  contracts: (filters: ContractListFilters) => ["assets", "contracts", filters] as const,
  contract: (id: string) => ["assets", "contract", id] as const,
};

const licensePath = (id: string) => `/assets/licenses/${encodeURIComponent(id)}`;

export function listLicenses(filters: LicenseListFilters): Promise<CursorPage<SoftwareLicenseItem>> {
  return apiRequest(`/assets/licenses${buildCommercialListQuery(filters)}`);
}

export function getLicense(id: string): Promise<SoftwareLicenseDetail> {
  return apiRequest(licensePath(id));
}

export function listLicenseAssignments(
  id: string,
  cursor?: string,
  limit?: number,
): Promise<CursorPage<SoftwareLicenseAssignment>> {
  const query = buildCommercialListQuery({ cursor, limit });
  return apiRequest(`${licensePath(id)}/assignments${query}`);
}

export function listAssetLicenseCoverage(
  assetId: string,
  cursor?: string,
  limit?: number,
): Promise<CursorPage<AssetLicenseLink>> {
  const query = buildCommercialListQuery({ cursor, limit });
  return apiRequest(`/assets/${encodeURIComponent(assetId)}/licenses${query}`);
}

export function searchLicenseUsers(
  id: string,
  search: string,
): Promise<{ readonly items: readonly AssetUserSummary[] }> {
  return apiRequest(`${licensePath(id)}/users?search=${encodeURIComponent(search)}`);
}

export function createLicense(input: SoftwareLicenseInput): Promise<{ readonly id: string }> {
  return apiRequest("/assets/licenses", { method: "POST", ...jsonBody(input) });
}

export function updateLicense(id: string, input: SoftwareLicenseInput): Promise<unknown> {
  return apiRequest(licensePath(id), { method: "PUT", ...jsonBody(input) });
}

export function deleteLicense(id: string): Promise<unknown> {
  return apiRequest(licensePath(id), { method: "DELETE" });
}

export function revealLicenseKey(id: string): Promise<{ readonly licenseKey: string }> {
  return apiRequest(`${licensePath(id)}/key`, { method: "POST" });
}

export function assignLicense(
  id: string,
  target: { readonly assetId?: string; readonly userId?: string },
): Promise<unknown> {
  return apiRequest(`${licensePath(id)}/assignments`, { method: "POST", ...jsonBody(target) });
}

export function releaseLicense(id: string, assignmentId: string): Promise<unknown> {
  return apiRequest(`${licensePath(id)}/assignments/${encodeURIComponent(assignmentId)}`, {
    method: "DELETE",
  });
}
