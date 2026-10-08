import { describe, expect, it } from "vitest";
import {
  matchCatalogEntry,
  normalizeDirectoryPath,
} from "@/lib/directory/match-catalog-entry";
import type { ManualDirectoryOrganizationalUnit } from "@/services/directory-sync-api";

function entry(
  overrides: Partial<ManualDirectoryOrganizationalUnit> = {},
): ManualDirectoryOrganizationalUnit {
  return {
    id: "unit-1",
    externalId: "ext-1",
    displayName: "Direkcija",
    organizationalUnitPath: "/Direkcija",
    distinguishedName: "OU=Direkcija,DC=local",
    parentExternalId: null,
    type: "DIRECTORATE",
    ...overrides,
  };
}

describe("normalizeDirectoryPath", () => {
  it("ignores case, padding and trailing separators", () => {
    expect(normalizeDirectoryPath(" /Direkcija/IT/ ")).toBe("/direkcija/it");
    expect(normalizeDirectoryPath("OU=IT,DC=local\\")).toBe("ou=it,dc=local");
  });
});

describe("matchCatalogEntry (paket 5.3.2)", () => {
  it("matches by path even when the casing differs", () => {
    const result = matchCatalogEntry([entry()], {
      ouPath: "/direkcija",
      distinguishedName: "OU=Direkcija,DC=local",
    });
    expect(result.kind).toBe("matched");
  });

  it("reports a path mismatch when only the DN still lines up", () => {
    const result = matchCatalogEntry([entry()], {
      ouPath: "/Direkcija/IT",
      distinguishedName: "ou=direkcija,dc=local",
    });
    expect(result).toMatchObject({
      kind: "path-mismatch",
      treePath: "/Direkcija/IT",
    });
  });

  it("falls back to a missing entry when the node has no DN", () => {
    const result = matchCatalogEntry([entry()], { ouPath: "/Direkcija/IT" });
    expect(result.kind).toBe("missing");
  });

  it("reports a missing entry without any match", () => {
    const result = matchCatalogEntry([entry()], {
      ouPath: "/Direkcija/IT",
      distinguishedName: "OU=IT,DC=local",
    });
    expect(result.kind).toBe("missing");
  });

  it("prefers the path match when both identifiers could match", () => {
    const result = matchCatalogEntry(
      [
        entry({ externalId: "by-dn", organizationalUnitPath: "/old" }),
        entry({ externalId: "by-path" }),
      ],
      { ouPath: "/Direkcija", distinguishedName: "OU=Direkcija,DC=local" },
    );
    expect(result).toMatchObject({ kind: "matched" });
    expect(result.kind === "matched" && result.entry.externalId).toBe("by-path");
  });
});
