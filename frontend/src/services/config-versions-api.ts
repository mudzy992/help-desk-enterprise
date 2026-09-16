import { apiRequest } from "@/services/api";
import type {
  ConfigShadowDiff,
  ConfigValidationResult,
  ConfigVersion,
  ConfigVersionDiff,
} from "@/services/config-versions-types";

export type {
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
