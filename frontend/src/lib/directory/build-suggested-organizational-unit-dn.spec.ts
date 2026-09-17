import { describe, expect, it } from "vitest";
import { buildSuggestedOrganizationalUnitDistinguishedName } from "@/lib/directory/build-suggested-organizational-unit-dn";

describe("buildSuggestedOrganizationalUnitDistinguishedName", () => {
  it("builds child DN from parent and rewrites root RDN", () => {
    expect(
      buildSuggestedOrganizationalUnitDistinguishedName({
        displayName: "Visoko",
        parentDistinguishedName:
          "OU=Djelatnost distribucije,OU=ED Zenica,OU=Korisnici,DC=epbih,DC=ba",
      }),
    ).toBe(
      "OU=Visoko,OU=Djelatnost distribucije,OU=ED Zenica,OU=Korisnici,DC=epbih,DC=ba",
    );
    expect(
      buildSuggestedOrganizationalUnitDistinguishedName({
        displayName: "Staff",
        parentDistinguishedName: null,
        existingDistinguishedName: "OU=Korisnici,DC=epbih,DC=ba",
      }),
    ).toBe("OU=Staff,DC=epbih,DC=ba");
  });
});
