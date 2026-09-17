import { describe, expect, it } from "vitest";
import { groupGroupsByUnit } from "@/lib/groups/group-groups-by-unit";

describe("groupGroupsByUnit", () => {
  it("groups by OU, sorts paths and group names", () => {
    const actual = groupGroupsByUnit([
      {
        id: "1",
        name: "Zeta",
        organizationalUnitId: "ou-b",
        organizationalUnitPath: "Org / Branch",
      },
      {
        id: "2",
        name: "Alpha",
        organizationalUnitId: "ou-a",
        organizationalUnitPath: "Org / Alpha",
      },
      {
        id: "3",
        name: "Beta",
        organizationalUnitId: "ou-a",
        organizationalUnitPath: "Org / Alpha",
      },
    ]);
    expect(actual.map((section) => section.organizationalUnitId)).toEqual([
      "ou-a",
      "ou-b",
    ]);
    expect(actual[0]?.groups.map((group) => group.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });
});
