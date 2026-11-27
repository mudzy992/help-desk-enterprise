// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionsPanel } from "@/components/rbac/permissions-panel";
import { ApiError } from "@/services/api";
import {
  getRolePermissions,
  listPermissionCatalog,
  listRoles,
  previewRolePermissions,
  replaceRolePermissions,
} from "@/services/rbac-api";

const toast = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "bs" },
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/services/rbac-api", () => ({
  listRoles: vi.fn(),
  listPermissionCatalog: vi.fn(),
  getRolePermissions: vi.fn(),
  previewRolePermissions: vi.fn(),
  replaceRolePermissions: vi.fn(),
}));

const auditUnavailable = () =>
  new ApiError(
    503,
    "AUTHORIZATION_AUDIT_UNAVAILABLE",
    "Authorization audit is unavailable",
    "req-refresh-1",
  );

function arrange() {
  vi.mocked(listRoles).mockResolvedValue([{ key: "AGENT", name: "Agent", permissionCount: 1 }]);
  vi.mocked(listPermissionCatalog).mockResolvedValue([
    { key: "problem.manage", description: "Upravljanje problemima", categoryId: "problems" },
  ]);
  vi.mocked(getRolePermissions).mockResolvedValue(["problem.manage"]);
  vi.mocked(previewRolePermissions).mockResolvedValue({
    previewToken: "token-1",
    roleKey: "AGENT",
    currentPermissionKeys: ["problem.manage"],
    proposedPermissionKeys: [],
    addedPermissionKeys: [],
    removedPermissionKeys: ["problem.manage"],
    affectedUserCount: 0,
    affectedAssignmentCount: 0,
    scopeImpacts: {
      global: 0,
      "organizational-unit": 0,
      service: 0,
      "organizational-unit-and-service": 0,
    },
    samples: [],
  });
  vi.mocked(replaceRolePermissions).mockResolvedValue([]);
}

/**
 * Drives the real flow: load → tick one permission off → review the impact →
 * confirm. `failRefresh` makes the guarded GETs that rebuild the view fail with
 * the audit 503, which is exactly the situation the operator hit in production.
 */
async function confirmSave(failRefresh: boolean) {
  render(<PermissionsPanel />);
  const toggle = await screen.findByRole("switch");
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "permissions.previewAction" }));
  const reason = await screen.findByRole("textbox");
  fireEvent.change(reason, { target: { value: "Uklanjam pravo agentima" } });
  if (failRefresh) vi.mocked(listRoles).mockRejectedValue(auditUnavailable());
  fireEvent.click(screen.getByRole("button", { name: "permissions.confirmSave" }));
}

describe("PermissionsPanel preview counts (W2.33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    arrange();
  });
  afterEach(cleanup);

  it("shows the grants behind a smaller headcount", async () => {
    vi.mocked(previewRolePermissions).mockResolvedValue({
      previewToken: "token-1",
      roleKey: "AGENT",
      currentPermissionKeys: ["problem.manage"],
      proposedPermissionKeys: [],
      addedPermissionKeys: [],
      removedPermissionKeys: ["problem.manage"],
      // Three grants for one person: the summary counts the person, the second
      // line explains why the scope counters can be larger.
      affectedUserCount: 1,
      affectedAssignmentCount: 3,
      scopeImpacts: {
        global: 2,
        "organizational-unit": 1,
        service: 0,
        "organizational-unit-and-service": 0,
      },
      samples: [],
    });

    render(<PermissionsPanel />);
    fireEvent.click(await screen.findByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "permissions.previewAction" }));

    expect(await screen.findByText("permissions.previewAssignmentCount")).toBeTruthy();
    expect(screen.getByText("permissions.previewSummary")).toBeTruthy();
  });
});

describe("PermissionsPanel save vs refresh (W7.72)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    arrange();
  });
  afterEach(cleanup);

  it("reports a committed save as saved when only the refresh fails", async () => {
    await confirmSave(true);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ tone: "success", title: "permissions.saved" }),
    );
    expect(toast).toHaveBeenCalledWith({
      tone: "warning",
      title: "permissions.savedRefreshFailed",
    });
    expect(await screen.findByTestId("permissions-saved-not-refreshed")).toBeTruthy();
    // "Operacija nad permisijama uloga nije uspjela" would be a false statement.
    expect(screen.queryByText("permissions.errorGeneric")).toBeNull();
  });

  it("reports a refused write as failed and says nothing was saved", async () => {
    vi.mocked(replaceRolePermissions).mockRejectedValueOnce(auditUnavailable());

    await confirmSave(false);

    await waitFor(() => expect(screen.getByText("permissions.errorGeneric")).toBeTruthy());
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "permissions.saved" }));
    expect(screen.queryByTestId("permissions-saved-not-refreshed")).toBeNull();
  });
});
