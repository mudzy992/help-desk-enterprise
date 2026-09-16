import { Settings, Wrench } from "lucide-react";
import { describe, expect, it } from "vitest";
import { resolveCategoryIcon } from "@/lib/settings/resolve-category-icon";

describe("resolveCategoryIcon", () => {
  it("returns the mapped Lucide icon for a known name", () => {
    expect(resolveCategoryIcon("wrench")).toBe(Wrench);
  });

  it("falls back to Settings for an unknown name", () => {
    expect(resolveCategoryIcon("not-a-real-icon")).toBe(Settings);
  });
});
