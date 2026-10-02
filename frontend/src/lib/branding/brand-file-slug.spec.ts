import { describe, expect, it } from "vitest";
import { brandFileSlug } from "./brand-file-slug";

describe("brandFileSlug", () => {
  it("makes a safe, lowercase file prefix", () => {
    expect(brandFileSlug("Service Desk")).toBe("service-desk");
    expect(brandFileSlug("Đurđevak · Čista Šuma IT")).toBe("durdevak-cista-suma-it");
  });

  it("falls back to the neutral name", () => {
    expect(brandFileSlug("··· ")).toBe("service-desk");
  });
});
