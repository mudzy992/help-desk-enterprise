import { describe, expect, it } from "vitest";
import { requireCatalogChangeReason } from "@/lib/services/require-catalog-change-reason";

describe("requireCatalogChangeReason", () => {
  it("rejects empty, whitespace, and oversized reasons", () => {
    expect(requireCatalogChangeReason("")).toBeNull();
    expect(requireCatalogChangeReason("   ")).toBeNull();
    expect(requireCatalogChangeReason("a".repeat(513))).toBeNull();
  });

  it("returns the trimmed reason when it is within bounds", () => {
    expect(requireCatalogChangeReason("  publish after review  ")).toBe(
      "publish after review",
    );
  });
});
