import { describe, expect, it } from "vitest";
import { buildContractInput, buildLicenseInput } from "@/lib/assets/asset-commercial-drafts";

const contract = {
  kind: "WARRANTY" as const,
  supplier: " Vendor ",
  reference: " R-1 ",
  startsAt: "2026-01-01",
  endsAt: "2026-12-31",
  cost: "12.50",
  notes: " note ",
  unitId: "ou-1",
};
const license = {
  productName: " Product ",
  vendor: " Vendor ",
  kind: "PER_DEVICE" as const,
  seats: "5",
  validUntil: "",
  cost: "20",
  notes: " note ",
  unitId: "ou-1",
  licenseKey: " KEY ",
  removeKey: false,
};

describe("asset commercial draft controllers", () => {
  it("normalizes a valid contract draft", () => {
    expect(buildContractInput(contract)).toEqual({
      ok: true,
      input: {
        kind: "WARRANTY",
        supplier: "Vendor",
        reference: "R-1",
        startsAt: "2026-01-01",
        endsAt: "2026-12-31",
        cost: 12.5,
        notes: "note",
        organizationalUnitId: "ou-1",
      },
    });
  });
  it("rejects invalid contract dates and money", () => {
    expect(buildContractInput({ ...contract, startsAt: "2027-01-01" })).toEqual({
      ok: false,
      error: "dates",
    });
    expect(buildContractInput({ ...contract, cost: "x" })).toEqual({ ok: false, error: "cost" });
  });
  it("normalizes a license and explicitly removes its key", () => {
    expect(buildLicenseInput({ ...license, removeKey: true })).toMatchObject({
      ok: true,
      input: { productName: "Product", seats: 5, licenseKey: "" },
    });
  });
  it("enforces seat and subscription expiry rules", () => {
    expect(buildLicenseInput({ ...license, seats: "-1" })).toEqual({ ok: false, error: "seats" });
    expect(buildLicenseInput({ ...license, kind: "SUBSCRIPTION", validUntil: "" })).toEqual({
      ok: false,
      error: "validUntil",
    });
  });
  it("allows site licenses without a seat count", () => {
    expect(buildLicenseInput({ ...license, kind: "SITE", seats: "" })).toMatchObject({
      ok: true,
      input: { seats: null },
    });
  });
});
