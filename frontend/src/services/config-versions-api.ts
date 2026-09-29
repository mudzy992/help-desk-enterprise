import { apiDownloadRequest, apiRequest, type ApiDownloadResult } from "@/services/api";
import type {
  ConfigPackageImportReport,
  ConfigPackageMappings,
  ConfigShadowDiff,
  ConfigValidationResult,
  ConfigVersion,
  ConfigVersionDiff,
} from "@/services/config-versions-types";

export type {
  ConfigPackageImportReport,
  ConfigPackageMappings,
  ConfigPackageReferenceKind,
  ConfigPackageResolutionItem,
  ConfigShadowDiff,
  ConfigValidationIssue,
  ConfigValidationResult,
  ConfigVersion,
  ConfigVersionDiff,
  ConfigVersionStatus,
} from "@/services/config-versions-types";

export function listConfigVersions(): Promise<readonly ConfigVersion[]> {
  return apiRequest("/config-versions");
}

export function createConfigVersion(releaseNotes?: string): Promise<ConfigVersion> {
  const notes = releaseNotes?.trim() ?? "";
  return apiRequest("/config-versions", {
    method: "POST",
    body: JSON.stringify(notes.length > 0 ? { releaseNotes: notes } : {}),
  });
}

export function diffConfigVersions(
  versionId: string,
  againstId: string,
): Promise<ConfigVersionDiff> {
  return apiRequest(
    `/config-versions/${versionId}/diff?againstId=${encodeURIComponent(againstId)}`,
  );
}

export function validateConfigVersion(
  versionId: string,
): Promise<ConfigValidationResult> {
  return apiRequest(`/config-versions/${versionId}/validate`, { method: "POST" });
}

export function activateConfigVersion(
  versionId: string,
  reason: string,
): Promise<ConfigVersion> {
  return apiRequest(`/config-versions/${versionId}/activate`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function rollbackConfigVersion(
  versionId: string,
  reason: string,
): Promise<ConfigVersion> {
  return apiRequest(`/config-versions/${versionId}/rollback`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function shadowConfigVersion(versionId: string): Promise<ConfigShadowDiff> {
  return apiRequest(`/config-versions/${versionId}/shadow`, { method: "POST" });
}

/* Paket 2.9 (K4): config packages. */

export function exportConfigPackage(
  versionId: string,
  includeEnvironmentBound: boolean,
): Promise<ApiDownloadResult> {
  const query = includeEnvironmentBound ? "?includeEnvironmentBound=true" : "";
  return apiDownloadRequest(`/config-versions/${versionId}/export${query}`);
}

export type ConfigPackageImportInput = {
  readonly file: File;
  readonly mappings: ConfigPackageMappings;
  readonly applyEnvironmentBound: boolean;
  readonly confirmUnsigned: boolean;
  readonly releaseNotes?: string;
};

function configPackageForm(input: ConfigPackageImportInput): FormData {
  const body = new FormData();
  body.append("file", input.file);
  body.append("mappings", JSON.stringify(input.mappings));
  body.append("applyEnvironmentBound", String(input.applyEnvironmentBound));
  body.append("confirmUnsigned", String(input.confirmUnsigned));
  const notes = input.releaseNotes?.trim() ?? "";
  if (notes.length > 0) {
    body.append("releaseNotes", notes);
  }
  return body;
}

export function previewConfigPackageImport(
  input: ConfigPackageImportInput,
): Promise<ConfigPackageImportReport> {
  return apiRequest("/config-versions/import/preview", { method: "POST", body: configPackageForm(input) });
}

export function importConfigPackage(input: ConfigPackageImportInput): Promise<ConfigVersion> {
  return apiRequest("/config-versions/import", { method: "POST", body: configPackageForm(input) });
}
