import { describe, expect, it } from "vitest";
import { buildSuggestedOrganizationalUnitDistinguishedName } from "@/lib/directory/build-suggested-organizational-unit-dn";

describe("buildSuggestedOrganizationalUnitDistinguishedName", () => {
  it("builds child DN from parent and rewrites root RDN", () => {
    expect(
      buildSuggestedOrganizationalUnitDistinguishedName({
        displayName: "Visoko",
        parentDistinguishedName:
          "OU=Sektor podrške,OU=Podružnica Zenica,OU=Korisnici,DC=example,DC=com",
      }),
    ).toBe(
      "OU=Visoko,OU=Sektor podrške,OU=Podružnica Zenica,OU=Korisnici,DC=example,DC=com",
    );
    expect(
      buildSuggestedOrganizationalUnitDistinguishedName({
        displayName: "Staff",
        parentDistinguishedName: null,
        existingDistinguishedName: "OU=Korisnici,DC=example,DC=com",
      }),
    ).toBe("OU=Staff,DC=example,DC=com");
  });
});
