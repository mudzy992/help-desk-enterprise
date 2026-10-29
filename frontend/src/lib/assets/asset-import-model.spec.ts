import { describe, expect, it } from "vitest";
import {
  assetImportMappingChanged,
  canApplyAssetImport,
  resolveAssetImportStep,
} from "./asset-import-model";

const totals = {
  rows: 2,
  create: 1,
  update: 1,
  unchanged: 0,
  skipped: 0,
  errors: 0,
  applied: null,
} as const;

const preview = { mapping: ["assetTag", "name"], totals, allOrNothing: false } as const;

describe("asset import workflow model", () => {
  it("resolves setup, file, mapping and confirmation steps", () => {
    expect(
      resolveAssetImportStep({ hasFile: false, preview: null, mapping: [], result: null }),
    ).toBe(0);
    expect(
      resolveAssetImportStep({ hasFile: true, preview: null, mapping: [], result: null }),
    ).toBe(1);
    expect(
      resolveAssetImportStep({ hasFile: true, preview, mapping: ["assetTag", null], result: null }),
    ).toBe(2);
    expect(
      resolveAssetImportStep({
        hasFile: true,
        preview,
        mapping: ["assetTag", "name"],
        result: null,
      }),
    ).toBe(3);
  });

  it("detects mapping conflicts before apply", () => {
    expect(assetImportMappingChanged(preview, ["assetTag", null])).toBe(true);
    expect(assetImportMappingChanged(preview, ["assetTag", "name"])).toBe(false);
  });

  it("blocks pending, empty, stale and all-or-nothing error previews", () => {
    expect(canApplyAssetImport(preview, preview.mapping, false)).toBe(true);
    expect(canApplyAssetImport(preview, preview.mapping, true)).toBe(false);
    expect(canApplyAssetImport(preview, ["assetTag", null], false)).toBe(false);
    expect(
      canApplyAssetImport(
        { ...preview, totals: { ...totals, create: 0, update: 0 } },
        preview.mapping,
        false,
      ),
    ).toBe(false);
    expect(
      canApplyAssetImport(
        { ...preview, allOrNothing: true, totals: { ...totals, errors: 1 } },
        preview.mapping,
        false,
      ),
    ).toBe(false);
  });
});
