import type { AssetImportApplyResult, AssetImportPreview } from "@/services/assets-api";

export type AssetImportStep = 0 | 1 | 2 | 3;

export function assetImportMappingChanged(
  preview: Pick<AssetImportPreview, "mapping">,
  mapping: readonly (string | null)[],
): boolean {
  return preview.mapping.some((value, index) => (value ?? null) !== (mapping[index] ?? null));
}

export function resolveAssetImportStep(input: {
  readonly hasFile: boolean;
  readonly preview: Pick<AssetImportPreview, "mapping"> | null;
  readonly mapping: readonly (string | null)[];
  readonly result: AssetImportApplyResult | null;
}): AssetImportStep {
  if (input.result !== null) return 3;
  if (input.preview === null) return input.hasFile ? 1 : 0;
  return assetImportMappingChanged(input.preview, input.mapping) ? 2 : 3;
}

export function canApplyAssetImport(
  preview: Pick<AssetImportPreview, "mapping" | "totals" | "allOrNothing">,
  mapping: readonly (string | null)[],
  pending: boolean,
): boolean {
  if (pending || assetImportMappingChanged(preview, mapping)) return false;
  if (preview.totals.create + preview.totals.update === 0) return false;
  return !preview.allOrNothing || preview.totals.errors === 0;
}
