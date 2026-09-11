import { describe, expect, it } from "vitest";
import {
  defaultOriginUnitId,
  directoryDisplayName,
  flattenOriginUnitOptions,
  formatByteSize,
  formatDurationMinutes,
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

describe("ticket display formatting", () => {
  it("formats byte sizes and duration minutes", () => {
    expect(formatByteSize(512)).toBe("512 B");
    expect(formatByteSize(2048)).toBe("2.0 KB");
    expect(formatDurationMinutes(90)).toBe("2m");
    expect(formatDurationMinutes(3660)).toBe("1h 1m");
    expect(formatDurationMinutes(null)).toBe("—");
  });

  it("resolves directory names and falls back to a truncated id", () => {
    expect(directoryDisplayName(new Map([["u1", "Amar Softić"]]), "u1")).toBe(
      "Amar Softić",
    );
    expect(directoryDisplayName(new Map(), "abcdefghijklmn")).toBe("abcdefgh…");
    expect(directoryDisplayName(new Map(), null)).toBeNull();
  });
});
