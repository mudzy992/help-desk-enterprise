import { describe, expect, it } from "vitest";
import {
  defaultOriginUnitId,
  flattenOriginUnitOptions,
} from "@/lib/tickets/ticket-display";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

const tree: readonly OrganizationalUnitTreeNode[] = [
  {
    id: "ou-root",
    name: "Korisnici",
    ouPath: "/Korisnici",
    children: [
      {
        id: "ou-it",
        name: "IT",
        ouPath: "/Korisnici/IT",
        children: [],
      },
    ],
  },
];

describe("flattenOriginUnitOptions", () => {
  it("flattens the tree in depth-first order and uses ouPath labels", () => {
    expect(flattenOriginUnitOptions(tree)).toEqual([
      { id: "ou-root", label: "/Korisnici" },
      { id: "ou-it", label: "/Korisnici/IT" },
    ]);
  });

  it("selects the only origin unit and leaves a multi-unit tree unselected", () => {
    expect(defaultOriginUnitId(flattenOriginUnitOptions(tree))).toBe("");
    expect(
      defaultOriginUnitId(flattenOriginUnitOptions([{ ...tree[0], children: [] }])),
    ).toBe("ou-root");
  });
});
