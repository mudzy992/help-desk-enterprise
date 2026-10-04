import { describe, expect, it } from "vitest";
import { docsHref, docsTargetForPath } from "./docs-slug";

describe("docsTargetForPath", () => {
  it("mapira tačnu rutu i njene podrute na istu stranicu", () => {
    expect(docsTargetForPath("/tickets")).toEqual({ slug: "tiketi" });
    expect(docsTargetForPath("/tickets/9f2b-123")).toEqual({ slug: "tiketi" });
    expect(docsTargetForPath("/account/security")).toEqual({ slug: "prijava-i-mfa" });
  });

  it("ne vraća ništa za rutu bez stranice dokumentacije", () => {
    expect(docsTargetForPath("/nepoznato")).toBeNull();
    expect(docsTargetForPath("/")).toBeNull();
  });

  it("duži prefiks ima prednost (moja imovina ≠ imovina)", () => {
    expect(docsTargetForPath("/my-assets")).toEqual({ slug: "imovina" });
    expect(docsTargetForPath("/assets")).toEqual({ slug: "imovina" });
  });

  it("ne hvata rutu koja samo počinje isto kao prefiks", () => {
    // `/assets-report` nije `/assets` + `/…`.
    expect(docsTargetForPath("/assets-report")).toBeNull();
  });
});

describe("docsHref", () => {
  it("bez anchora daje čistu putanju", () => {
    expect(docsHref({ slug: "tiketi" })).toBe("/docs/tiketi");
  });

  it("s anchorom dodaje fragment", () => {
    expect(docsHref({ slug: "tiketi", anchor: "statusi" })).toBe("/docs/tiketi#statusi");
  });
});
