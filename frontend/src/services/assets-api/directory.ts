import { apiRequest } from "@/services/api";

export type AssetDirectorySyncTotals = {
  readonly seen: number;
  readonly create: number;
  readonly update: number;
  readonly adopt: number;
  readonly restore: number;
  readonly missing: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly suggestions: number;
};

export type AssetDirectoryConflict = {
  readonly assetId: string;
  readonly name: string;
  readonly assetTag?: string;
  readonly assignedUser: string | null;
  readonly suggestedUser: string | null;
  readonly matchedBy: string;
};

export type AssetDirectorySyncStatus = {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly intervalHours: number;
  readonly lastRun: {
    readonly at: string;
    readonly dryRun: boolean;
    readonly trigger: string;
    readonly totals: AssetDirectorySyncTotals | null;
    readonly conflicts: readonly AssetDirectoryConflict[];
    readonly missingGuardTripped: boolean;
  } | null;
  readonly lastApplied: { readonly at: string } | null;
  readonly directoryAssets: number;
  readonly missingAssets: number;
};

export type AssetDirectorySyncReport = {
  readonly dryRun: boolean;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly totals: AssetDirectorySyncTotals;
  readonly applied: {
    readonly created: number;
    readonly updated: number;
    readonly failed: number;
  } | null;
  readonly missingGuardTripped: boolean;
  readonly wouldFlagMissing: number;
  readonly conflicts: readonly AssetDirectoryConflict[];
  readonly skipped: readonly {
    readonly externalId: string;
    readonly name: string;
    readonly reason: "no_unit" | "no_type" | "hostname_ambiguous";
  }[];
  readonly preview: readonly {
    readonly name: string;
    readonly action: string;
    readonly changes: readonly string[];
  }[];
  readonly domainController: string | null;
};

export const assetDirectoryQueryKeys = {
  status: ["assets", "directory-sync"] as const,
};

export function getAssetDirectorySyncStatus(): Promise<AssetDirectorySyncStatus> {
  return apiRequest("/assets/directory-sync");
}

export function runAssetDirectorySync(dryRun: boolean): Promise<AssetDirectorySyncReport> {
  return apiRequest(`/assets/directory-sync/${dryRun ? "dry-run" : "run"}`, { method: "POST" });
}
