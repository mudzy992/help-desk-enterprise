// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useManualDirectoryCatalogActions } from "./use-manual-directory-catalog-actions";
import { ApiError } from "@/services/api";
import type { OrganizationalUnitTreeNode } from "@/services/organizational-units-api";

const directoryApi = vi.hoisted(() => ({
  listManualDirectoryOrganizationalUnits: vi.fn(),
}));
const unitsApi = vi.hoisted(() => ({
  deleteOrganizationalUnit: vi.fn(),
}));
const syncApi = vi.hoisted(() => ({
  syncManualDirectoryCatalog: vi.fn(),
}));

vi.mock("@/services/directory-sync-api", () => ({
  listManualDirectoryOrganizationalUnits: directoryApi.listManualDirectoryOrganizationalUnits,
}));
vi.mock("@/services/organizational-units-api", () => ({
  deleteOrganizationalUnit: unitsApi.deleteOrganizationalUnit,
}));
vi.mock("@/lib/directory/sync-manual-directory-catalog", () => ({
  syncManualDirectoryCatalog: syncApi.syncManualDirectoryCatalog,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const node: OrganizationalUnitTreeNode = {
  id: "ou-1",
  name: "Poslovnica",
  ouPath: "/Ogranak/Poslovnica",
  distinguishedName: "OU=Poslovnica,OU=Ogranak,DC=local",
  children: [],
};

describe("useManualDirectoryCatalogActions — delete (W2.37b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    directoryApi.listManualDirectoryOrganizationalUnits.mockResolvedValue([]);
    unitsApi.deleteOrganizationalUnit.mockResolvedValue({ warnings: [] });
    syncApi.syncManualDirectoryCatalog.mockResolvedValue(undefined);
  });

  it("deletes through the organizational-unit route even when the catalogue has no row", async () => {
    const reloadDirectory = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useManualDirectoryCatalogActions({ canManage: true, reloadDirectory }),
    );
    await waitFor(() =>
      expect(directoryApi.listManualDirectoryOrganizationalUnits).toHaveBeenCalled(),
    );

    await act(async () => result.current.handleDelete(node));

    // Before W2.37b this produced "this OU is not in the manual-only catalogue"
    // for a unit the operator had just created.
    expect(unitsApi.deleteOrganizationalUnit).toHaveBeenCalledWith("ou-1");
    expect(result.current.actionError).toBeNull();
    expect(result.current.catalogHint).toBe("directory.ouDeleteSucceeded");
    expect(reloadDirectory).toHaveBeenCalledTimes(1);
  });

  it("reports the removed role assignments from the delete response", async () => {
    unitsApi.deleteOrganizationalUnit.mockResolvedValue({
      warnings: [{ code: "ROLE_ASSIGNMENTS_REMOVED", count: 2 }],
    });
    const { result } = renderHook(() =>
      useManualDirectoryCatalogActions({
        canManage: true,
        reloadDirectory: vi.fn().mockResolvedValue(undefined),
      }),
    );
    await waitFor(() =>
      expect(directoryApi.listManualDirectoryOrganizationalUnits).toHaveBeenCalled(),
    );

    await act(async () => result.current.handleDelete(node));

    expect(result.current.catalogHint).toBe("directory.ouDeleteRoleAssignmentsWarning");
  });

  it("keeps blocker details from the API instead of the raw backend sentence", async () => {
    unitsApi.deleteOrganizationalUnit.mockRejectedValue(
      new ApiError(409, "HAS_CHILDREN", "Organizational unit is still in use", "req-1", {
        blockers: [{ kind: "directoryChildren", count: 2 }],
      }),
    );
    const { result } = renderHook(() =>
      useManualDirectoryCatalogActions({
        canManage: true,
        reloadDirectory: vi.fn().mockResolvedValue(undefined),
      }),
    );
    await waitFor(() =>
      expect(directoryApi.listManualDirectoryOrganizationalUnits).toHaveBeenCalled(),
    );

    await act(async () => result.current.handleDelete(node));

    expect(result.current.actionError?.organizationalUnitId).toBe("ou-1");
    expect(result.current.actionError?.message).toContain(
      "directory.ouBlockerKinds.directoryChildren: 2",
    );
    expect(result.current.actionError?.message).not.toContain("still in use");
  });
});
