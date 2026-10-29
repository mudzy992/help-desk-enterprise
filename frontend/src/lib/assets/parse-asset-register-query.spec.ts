import { describe, expect, it } from "vitest";
import {
  parseAssetBoolean,
  parseAssetSource,
  parseAssetStatus,
} from "@/lib/assets/parse-asset-register-query";

describe("asset register query parsing", () => {
  it("accepts only known enum values", () => {
    expect(parseAssetStatus("IN_USE")).toBe("IN_USE");
    expect(parseAssetStatus("BROKEN")).toBe("");
    expect(parseAssetSource("DIRECTORY")).toBe("DIRECTORY");
    expect(parseAssetSource("OTHER")).toBe("");
  });

  it("only treats the canonical true value as enabled", () => {
    expect(parseAssetBoolean("true")).toBe(true);
    expect(parseAssetBoolean("1")).toBe(false);
  });
});
