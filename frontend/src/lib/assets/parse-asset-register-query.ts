import { assetStatuses, type AssetSource, type AssetStatus } from "@/services/assets-api";

const assetSources = ["MANUAL", "IMPORT", "DIRECTORY"] as const satisfies readonly AssetSource[];

function parseOne<T extends string>(raw: string | null, values: readonly T[]): T | "" {
  return raw !== null && values.some((value) => value === raw) ? (raw as T) : "";
}

export function parseAssetStatus(raw: string | null): AssetStatus | "" {
  return parseOne(raw, assetStatuses);
}

export function parseAssetSource(raw: string | null): AssetSource | "" {
  return parseOne(raw, assetSources);
}

export function parseAssetBoolean(raw: string | null): boolean {
  return raw === "true";
}
