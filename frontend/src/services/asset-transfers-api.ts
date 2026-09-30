import { apiDownloadRequest, apiRequest } from "@/services/api";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";

/**
 * Paket 3.2 C9 (§7a): equipment moves and transfer records (`prenosnice`).
 * Types mirror `backend/src/modules/assets/transfers`.
 */

export const assetTransferScenarios = ["WAREHOUSE_TO_USER", "USER_TO_USER", "USER_TO_WAREHOUSE"] as const;
export type AssetTransferScenario = (typeof assetTransferScenarios)[number];
export const assetTransferStatuses = ["ISSUED", "SIGNED", "CANCELLED"] as const;
export type AssetTransferStatus = (typeof assetTransferStatuses)[number];

export type TransferParty = {
  readonly userId: string | null;
  readonly name: string;
  readonly title: string;
  readonly unit: string;
  readonly email: string;
};

export type AssetMovementInput = {
  readonly scenario: AssetTransferScenario;
  readonly assetIds: readonly string[];
  readonly toUserId?: string;
  readonly fromLabel?: string;
  readonly toLabel?: string;
  readonly organizationalUnitId?: string;
  readonly locationId?: string;
  readonly returnStatus?: "IN_STOCK" | "IN_REPAIR";
  readonly note?: string;
  readonly issueDocument?: boolean;
  readonly signatoryUserId?: string;
};

export type AssetMovementPreview = {
  readonly scenario: AssetTransferScenario;
  readonly transferEnabled: boolean;
  readonly transferRequired: boolean;
  readonly from: TransferParty;
  readonly to: TransferParty;
  readonly signatory: TransferParty;
  readonly signatorySource: "unit" | "default" | "none" | "manual";
  readonly suggestedOrganizationalUnitId: string | null;
  readonly problems: readonly string[];
};

export type AssetMovementResult = {
  readonly transferId: string | null;
  readonly number: string | null;
  readonly movedAssetIds: readonly string[];
};

export type AssetTransferListItem = {
  readonly id: string;
  readonly number: string;
  readonly scenario: AssetTransferScenario;
  readonly status: AssetTransferStatus;
  readonly issuedAt: string;
  readonly signedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelReason: string | null;
  readonly from: { readonly userId: string | null; readonly name: string };
  readonly to: { readonly userId: string | null; readonly name: string };
  readonly signatoryName: string;
  readonly itemCount: number;
  readonly items: readonly { readonly assetId: string; readonly assetTag: string; readonly name: string }[];
  readonly hasSignedCopy: boolean;
};

export type AssetTransferFilters = {
  readonly search?: string;
  readonly status?: AssetTransferStatus;
  readonly scenario?: AssetTransferScenario;
  readonly cursor?: string;
};

export type AssetSignatoryUnit = {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly own: { readonly userId: string; readonly displayName: string; readonly email: string; readonly title: string | null; readonly isActive: boolean } | null;
  readonly effective: {
    readonly source: "unit" | "default" | "none";
    readonly userId: string | null;
    readonly displayName: string | null;
    readonly inheritedFromUnitId: string | null;
  };
};

export type AssetSignatoryOverview = {
  readonly defaultSignatory: { readonly id: string; readonly displayName: string; readonly email: string } | null;
  readonly units: readonly AssetSignatoryUnit[];
};

export type AssetTransferTemplate = {
  readonly id: string;
  readonly version: number;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly tags: readonly string[];
  readonly notes: string | null;
  readonly createdAt: string;
  readonly isActive: boolean;
};

export const assetTransferQueryKeys = {
  all: ["assets", "transfers"] as const,
  configuration: ["assets", "transfers", "configuration"] as const,
  list: (filters: AssetTransferFilters) => ["assets", "transfers", "list", filters] as const,
  forAsset: (assetId: string) => ["assets", "transfers", "asset", assetId] as const,
  mine: ["assets", "transfers", "mine"] as const,
  signatories: ["assets", "transfers", "signatories"] as const,
  templates: ["assets", "transfers", "templates"] as const,
};

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const transferPath = (id: string) => `/assets/transfers/${encodeURIComponent(id)}`;

export function getTransferConfiguration(): Promise<{ readonly enabled: boolean; readonly required: boolean }> {
  return apiRequest("/assets/transfers/configuration");
}

export function previewAssetMovement(input: AssetMovementInput): Promise<AssetMovementPreview> {
  return apiRequest("/assets/movements/preview", { method: "POST", ...json(input) });
}

export function moveAssets(input: AssetMovementInput): Promise<AssetMovementResult> {
  return apiRequest("/assets/movements", { method: "POST", ...json(input) });
}

export function listAssetTransfers(filters: AssetTransferFilters): Promise<{ readonly items: readonly AssetTransferListItem[]; readonly nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.scenario) params.set("scenario", filters.scenario);
  if (filters.cursor) params.set("cursor", filters.cursor);
  const query = params.toString();
  return apiRequest(`/assets/transfers${query ? `?${query}` : ""}`);
}

export function listAssetTransfersForAsset(assetId: string): Promise<readonly AssetTransferListItem[]> {
  return apiRequest(`/assets/${encodeURIComponent(assetId)}/transfers`);
}

export function listMyAssetTransfers(): Promise<readonly AssetTransferListItem[]> {
  return apiRequest("/assets/transfers/mine");
}

export async function downloadTransferDocument(id: string, number: string): Promise<void> {
  const result = await apiDownloadRequest(`${transferPath(id)}/document`);
  triggerBlobDownload(result.blob, result.fileName ?? `${number}.docx`);
}

export async function downloadSignedTransfer(id: string, number: string): Promise<void> {
  const result = await apiDownloadRequest(`${transferPath(id)}/signed`);
  triggerBlobDownload(result.blob, result.fileName ?? number);
}

export function uploadSignedTransfer(id: string, file: File): Promise<unknown> {
  const body = new FormData();
  body.append("file", file);
  return apiRequest(`${transferPath(id)}/signed`, { method: "POST", body });
}

export function cancelAssetTransfer(id: string, reason: string): Promise<unknown> {
  return apiRequest(`${transferPath(id)}/cancel`, { method: "POST", ...json({ reason }) });
}

export function getAssetSignatories(): Promise<AssetSignatoryOverview> {
  return apiRequest("/assets/transfers/signatories");
}

export function saveAssetSignatory(unitId: string, userId: string, title: string): Promise<unknown> {
  return apiRequest(`/assets/transfers/signatories/${encodeURIComponent(unitId)}`, { method: "PUT", ...json({ userId, title: title || undefined }) });
}

export function removeAssetSignatory(unitId: string): Promise<unknown> {
  return apiRequest(`/assets/transfers/signatories/${encodeURIComponent(unitId)}`, { method: "DELETE" });
}

export function listTransferTemplates(): Promise<readonly AssetTransferTemplate[]> {
  return apiRequest("/assets/transfers/templates");
}

export function uploadTransferTemplate(
  file: File,
  notes: string,
): Promise<{ readonly id: string; readonly version: number; readonly tags: readonly string[]; readonly unknownTags: readonly string[] }> {
  const body = new FormData();
  body.append("file", file);
  if (notes) body.append("notes", notes);
  return apiRequest("/assets/transfers/templates", { method: "POST", body });
}

export async function downloadTransferTemplate(version: number | "default" | "sample", locale?: string): Promise<void> {
  const suffix = version === "default" && locale ? `default?locale=${encodeURIComponent(locale)}` : String(version);
  const result = await apiDownloadRequest(`/assets/transfers/templates/${suffix}`);
  triggerBlobDownload(result.blob, result.fileName ?? "prenosnica.docx");
}
