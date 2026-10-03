import { describe, expect, it } from "vitest";
import { filterDocsByAudience, matchesDocsAudience } from "./docs-audience";

describe("matchesDocsAudience (Faza 3 c)", () => {
  it("stranica bez rola se vidi u svakom filteru", () => {
    expect(matchesDocsAudience({ roles: [] }, "user")).toBe(true);
    expect(matchesDocsAudience({ roles: [] }, "agent")).toBe(true);
    expect(matchesDocsAudience({ roles: [] }, "admin")).toBe(true);
  });

  it("filter prikazuje samo stranice svojstvene publici", () => {
    expect(matchesDocsAudience({ roles: ["ADMIN", "SUPER_ADMIN"] }, "user")).toBe(false);
    expect(matchesDocsAudience({ roles: ["ADMIN", "SUPER_ADMIN"] }, "admin")).toBe(true);
    expect(matchesDocsAudience({ roles: ["AGENT", "PROBLEM_MANAGER", "ADMIN"] }, "agent")).toBe(true);
    expect(matchesDocsAudience({ roles: ["AGENT"] }, "admin")).toBe(false);
  });

  it("filter ne mijenja redoslijed i vraća novi niz", () => {
    const pages = [
      { slug: "a", roles: [] },
      { slug: "b", roles: ["ADMIN"] },
      { slug: "c", roles: ["AGENT"] },
    ];
    expect(filterDocsByAudience(pages, "admin").map((page) => page.slug)).toEqual(["a", "b"]);
    expect(filterDocsByAudience(pages, "all")).toHaveLength(3);
  });
});
