// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "@/pages/admin-page";

const state = vi.hoisted(() => ({ superAdmin: false, roles: ["ADMIN"] as string[] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({
    session: {
      isSuperAdmin: state.superAdmin,
      roleKeys: state.roles,
      permissionKeys: [],
      principal: { subjectId: "admin-1", isLocalOnly: false },
    },
    isLoading: false,
    retry: () => undefined,
    hasRole: (role: string) => state.roles.includes(role),
    hasPermission: () => false,
  }),
}));
vi.mock("@/pages/organizational-units-page", () => ({
  OrganizationalUnitsPage: () => <div>org-panel</div>,
}));
vi.mock("@/pages/groups-page", () => ({ GroupsPage: () => <div>groups-panel</div> }));
vi.mock("@/pages/users-page", () => ({ UsersPage: () => <div>users-panel</div> }));
vi.mock("@/pages/permissions-page", () => ({
  PermissionsPage: () => <div>permissions-panel</div>,
}));
vi.mock("@/pages/settings-page", () => ({ SettingsPage: () => <div>settings-panel</div> }));
vi.mock("@/components/admin/admin-ops-panel", () => ({
  AdminOpsPanel: () => <div>ops-panel</div>,
}));
vi.mock("@/components/admin/admin-security-panel", () => ({
  AdminSecurityPanel: () => <div>security-panel</div>,
}));

describe("AdminPage access", () => {
  beforeEach(() => {
    state.superAdmin = false;
    state.roles = ["ADMIN"];
  });

  it("hides the security tab from an ADMIN", () => {
    render(<AdminPage />, { wrapper: MemoryRouter });
    expect(screen.queryByText("admin.tabs.security")).toBeNull();
    expect(screen.getByText("org-panel")).toBeTruthy();
  });

  it("shows and resolves the security tab for a SUPER_ADMIN deep link", () => {
    state.superAdmin = true;
    state.roles = ["SUPER_ADMIN"];
    render(
      <MemoryRouter initialEntries={["/?tab=security"]}>
        <AdminPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("admin.tabs.security")).toBeTruthy();
    expect(screen.getByText("security-panel")).toBeTruthy();
  });
});
