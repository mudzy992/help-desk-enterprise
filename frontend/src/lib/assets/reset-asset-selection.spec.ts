import { describe, expect, it } from "vitest";
import { resetAssetSelection } from "@/lib/assets/reset-asset-selection";

describe("asset filter selection reset", () => {
  it("returns an empty selection for the next filter scope", () => {
    const previous = new Map([["hidden-asset", { id: "hidden-asset" }]]);
    const next = resetAssetSelection<{ id: string }>();
    expect(previous.size).toBe(1);
    expect(next.size).toBe(0);
    expect(next).not.toBe(previous);
  });
});
