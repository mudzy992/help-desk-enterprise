import { describe, expect, it } from "vitest";
import { buildAssetListQuery } from "@/services/assets-api";
import { assetStatusTransitions, daysUntil, formatAttributeValue, warrantyState } from "@/lib/assets/asset-view";

describe("asset view helpers (paket 3.2)", () => {
  const now = new Date("2026-09-29T10:00:00Z");

  it("computes days and warranty state from date-only values", () => {
    expect(daysUntil("2026-09-29", now)).toBe(0);
    expect(daysUntil("2026-10-09", now)).toBe(10);
    expect(daysUntil(null, now)).toBeNull();
    expect(warrantyState("2026-09-28", 30, now)).toBe("expired");
    expect(warrantyState("2026-10-20", 30, now)).toBe("expiring");
    expect(warrantyState("2027-10-20", 30, now)).toBe("valid");
    expect(warrantyState(null, 30, now)).toBe("none");
  });

  it("keeps disposed final like the backend", () => {
    expect(assetStatusTransitions.DISPOSED).toEqual([]);
    expect(assetStatusTransitions.RETIRED).toContain("DISPOSED");
    expect(assetStatusTransitions.IN_USE).not.toContain("DISPOSED");
  });

  it("formats attribute values for display", () => {
    expect(formatAttributeValue(true, "BOOLEAN", "en", "Yes", "No")).toBe("Yes");
    expect(formatAttributeValue(undefined, "TEXT", "en", "Yes", "No")).toBe("—");
    expect(formatAttributeValue("abc", "TEXT", "en", "Yes", "No")).toBe("abc");
  });

  it("builds list query strings without empty filters", () => {
    expect(buildAssetListQuery({})).toBe("");
    expect(buildAssetListQuery({ search: " pc ", status: ["IN_USE", "IN_REPAIR"], unassigned: true, limit: 50 })).toBe(
      "?search=pc&status=IN_USE%2CIN_REPAIR&unassigned=true&limit=50",
    );
  });
});

import { flattenLocationTree, locationHeight, locationSubtree } from "@/lib/assets/asset-view";

describe("location tree (paket 3.2 §7)", () => {
  const locations = [
    { id: "hq", name: "Direkcija", parentId: null },
    { id: "vi", name: "Visoko", parentId: "ze" },
    { id: "ze", name: "Podružnica Zenica", parentId: "hq" },
  ];

  it("orders parents before children with full paths", () => {
    expect(flattenLocationTree(locations).map((row) => [row.location.id, row.depth, row.path])).toEqual([
      ["hq", 1, "Direkcija"],
      ["ze", 2, "Direkcija › Podružnica Zenica"],
      ["vi", 3, "Direkcija › Podružnica Zenica › Visoko"],
    ]);
    expect([...locationSubtree(locations, "ze")].sort()).toEqual(["vi", "ze"]);
    expect(locationHeight(locations, "hq")).toBe(2);
  });
});
