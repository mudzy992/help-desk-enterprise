import { buildAssetListQuery } from "./catalog";
import type { AssetListFilters } from "./types";
import { apiDownloadRequest, apiRequest } from "@/services/api";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";

export type AssetImportMode = "CREATE_ONLY" | "UPSERT";
export type AssetImportStatus = "PREVIEW" | "APPLYING" | "APPLIED" | "FAILED" | "EXPIRED";

export type AssetImportTotals = {
  readonly total: number;
  readonly create: number;
  readonly update: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly errors: number;
  readonly duplicateSkipped?: number;
  readonly applied?: {
    readonly created: number;
    readonly updated: number;
    readonly failed: number;
  };
};

export type AssetImportRowError = {
  readonly row: number;
  readonly column: string | null;
  readonly code: string;
  readonly value?: string;
};

export type AssetImportColumn = {
  readonly key: string;
  readonly labelBs: string;
  readonly labelEn: string;
};

export type AssetImportPreview = {
  readonly id: string;
  readonly status: "PREVIEW";
  readonly type: {
    readonly id: string;
    readonly key: string;
    readonly nameBs: string;
    readonly nameEn: string;
  };
  readonly fileName: string;
  readonly mode: AssetImportMode;
  readonly allOrNothing: boolean;
  readonly headers: readonly string[];
  readonly mapping: readonly (string | null)[];
  readonly suggestedMapping: readonly (string | null)[];
  readonly columns: readonly AssetImportColumn[];
  readonly totals: AssetImportTotals;
  readonly errors: readonly AssetImportRowError[];
  readonly errorCount: number;
  readonly duplicateOfJobId: string | null;
  readonly expiresAt: string;
};

export type AssetImportApplyResult = {
  readonly id: string;
  readonly status: "APPLIED" | "FAILED";
  readonly applied: { readonly created: number; readonly updated: number; readonly failed: number };
  readonly failures: readonly AssetImportRowError[];
};

export type AssetImportJob = {
  readonly id: string;
  readonly fileName: string;
  readonly status: AssetImportStatus;
  readonly mode: AssetImportMode;
  readonly allOrNothing: boolean;
  readonly totals: AssetImportTotals;
  readonly type: {
    readonly id: string;
    readonly key: string;
    readonly nameBs: string;
    readonly nameEn: string;
  } | null;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly appliedAt: string | null;
  readonly expiresAt: string;
  readonly applyLeaseUntil: string | null;
};

export const assetImportQueryKeys = {
  jobs: ["assets", "import", "jobs"] as const,
};

export async function downloadAssetImportTemplate(typeId: string, locale: string): Promise<void> {
  const result = await apiDownloadRequest(
    `/assets/import/template?typeId=${encodeURIComponent(typeId)}&locale=${encodeURIComponent(locale)}`,
  );
  triggerBlobDownload(result.blob, result.fileName ?? "asset-import.xlsx");
}

export function previewAssetImport(input: {
  readonly file: File;
  readonly typeId: string;
  readonly mode: AssetImportMode;
  readonly allOrNothing: boolean;
  readonly mapping?: readonly (string | null)[];
}): Promise<AssetImportPreview> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("typeId", input.typeId);
  body.append("mode", input.mode);
  body.append("allOrNothing", input.allOrNothing ? "true" : "false");
  if (input.mapping) body.append("mapping", JSON.stringify(input.mapping));
  return apiRequest("/assets/import/preview", { method: "POST", body });
}

export function applyAssetImport(id: string): Promise<AssetImportApplyResult> {
  return apiRequest(`/assets/import/${encodeURIComponent(id)}/apply`, { method: "POST" });
}

export function discardAssetImport(id: string): Promise<unknown> {
  return apiRequest(`/assets/import/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listAssetImports(): Promise<{ readonly items: readonly AssetImportJob[] }> {
  return apiRequest("/assets/import");
}

export async function downloadAssetImportErrors(id: string, locale: string): Promise<void> {
  const result = await apiDownloadRequest(
    `/assets/import/${encodeURIComponent(id)}/errors?locale=${encodeURIComponent(locale)}`,
  );
  triggerBlobDownload(result.blob, result.fileName ?? "asset-import-errors.xlsx");
}

export async function exportAssets(
  filters: AssetListFilters,
  format: "xlsx" | "csv",
  locale: string,
): Promise<void> {
  const query = buildAssetListQuery({ ...filters, cursor: undefined, limit: undefined });
  const separator = query.length > 0 ? "&" : "?";
  const result = await apiDownloadRequest(
    `/assets/export${query}${separator}format=${format}&locale=${encodeURIComponent(locale)}`,
  );
  triggerBlobDownload(result.blob, result.fileName ?? `assets.${format}`);
}

// ------------------------------------------------------------ AD computers (requirement)
