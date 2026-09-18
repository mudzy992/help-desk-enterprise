import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadDirectory } from "@/lib/directory/load-directory";
import { ApiError } from "@/services/api";
import {
  listOrganizationalUnitTree,
  listOrganizationalUnitUsers,
} from "@/services/organizational-units-api";

vi.mock("@/services/organizational-units-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/organizational-units-api")>();
  return {
    ...actual,
    listOrganizationalUnitTree: vi.fn(),
    listOrganizationalUnitUsers: vi.fn(),
  };
});

const tree = [
  { id: "ou-it", name: "IT", ouPath: "/IT", children: [] },
] as const;

describe("loadDirectory", () => {
  beforeEach(() => {
    vi.mocked(listOrganizationalUnitTree).mockReset();
    vi.mocked(listOrganizationalUnitUsers).mockReset();
  });

  it("degrades to an empty directory when the OU tree returns 403", async () => {
    vi.mocked(listOrganizationalUnitTree).mockRejectedValue(
      new ApiError(403, "FORBIDDEN", "Forbidden", "req-1"),
    );
    const result = await loadDirectory();
    expect(result.tree).toEqual([]);
    expect(result.users).toEqual([]);
    expect(result.errorKey).toBe("errors.forbidden");
    expect(result.requestId).toBe("req-1");
    expect(listOrganizationalUnitUsers).not.toHaveBeenCalled();
  });

  it("keeps the tree when a unit membership call returns 403", async () => {
    vi.mocked(listOrganizationalUnitTree).mockResolvedValue([...tree]);
    vi.mocked(listOrganizationalUnitUsers).mockRejectedValue(
      new ApiError(403, "FORBIDDEN", "Forbidden"),
    );
    const result = await loadDirectory();
    expect(result.errorKey).toBeNull();
    expect(result.tree).toEqual([...tree]);
    expect(result.users).toEqual([]);
  });

  it("attaches organizational unit paths to directory users", async () => {
    vi.mocked(listOrganizationalUnitTree).mockResolvedValue([...tree]);
    vi.mocked(listOrganizationalUnitUsers).mockResolvedValue([
      {
        id: "user-1",
        email: "ana@example.com",
        displayName: "Ana",
        organizationalUnitId: "ou-it",
      },
    ]);
    const result = await loadDirectory();
    expect(result.errorKey).toBeNull();
    expect(result.users).toEqual([
      {
        id: "user-1",
        email: "ana@example.com",
        displayName: "Ana",
        organizationalUnitId: "ou-it",
        organizationalUnitPath: "/IT",
      },
    ]);
  });
});
