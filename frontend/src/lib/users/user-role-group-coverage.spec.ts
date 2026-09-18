import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findUserRoleGroupCoverageGaps,
  userIsMemberOfAnyGroupForOrganizationalUnit,
} from "@/lib/users/user-role-group-coverage";
import { getGroup, listGroups } from "@/services/groups-api";

vi.mock("@/services/groups-api", () => ({
  listGroups: vi.fn(),
  getGroup: vi.fn(),
}));

describe("user-role-group-coverage", () => {
  beforeEach(() => {
    vi.mocked(listGroups).mockReset();
    vi.mocked(getGroup).mockReset();
  });

  it("detects membership in a group for the organizational unit", async () => {
    vi.mocked(listGroups).mockResolvedValue([
      {
        id: "group-1",
        name: "IT Support",
        key: "it-support",
        organizationalUnitId: "ou-1",
        organizationalUnitPath: "IT",
        isFallback: false,
        memberCount: 1,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    vi.mocked(getGroup).mockResolvedValue({
      id: "group-1",
      name: "IT Support",
      key: "it-support",
      organizationalUnitId: "ou-1",
      organizationalUnitPath: "IT",
      isFallback: false,
      memberCount: 1,
      createdAt: "",
      updatedAt: "",
      members: [
        {
          id: "member-1",
          userId: "user-1",
          displayName: "Agent",
          email: "agent@example.com",
          createdAt: "",
        },
      ],
    });
    const actual = await userIsMemberOfAnyGroupForOrganizationalUnit(
      "user-1",
      "ou-1",
    );
    expect(actual).toBe(true);
  });

  it("returns gaps for scoped roles without group membership", async () => {
    vi.mocked(listGroups).mockResolvedValue([]);
    const actual = await findUserRoleGroupCoverageGaps("user-1", [
      {
        id: "user-role-1",
        roleKey: "AGENT",
        roleName: "Agent",
        organizationalUnitId: "ou-1",
        organizationalUnitPath: "Breza",
        serviceId: null,
        serviceName: null,
      },
    ]);
    expect(actual).toEqual([
      {
        userRoleId: "user-role-1",
        organizationalUnitId: "ou-1",
        organizationalUnitLabel: "Breza",
      },
    ]);
  });
});
