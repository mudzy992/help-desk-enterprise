// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ConfigVersionsPage } from "@/pages/config-versions-page";

const state = vi.hoisted(() => ({
  policyStatus: "unlocked" as "loading" | "error" | "locked" | "unlocked",
  retry: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({
    session: { isSuperAdmin: true, roleKeys: ["SUPER_ADMIN"], permissionKeys: [] },
    isLoading: false,
  }),
}));
vi.mock("@/lib/config-versions/can-access-config-versions", () => ({
  canOpenConfigVersions: () => true,
  canWriteConfigVersions: () => true,
  canImportConfigPackage: () => true,
}));
vi.mock("@/lib/settings/use-admin-module-read-only", () => ({
  adminReadOnlyModuleKeys: { settings: "settings" },
  useAdminModuleReadOnly: () => ({
    status: state.policyStatus,
    canWrite: state.policyStatus === "unlocked",
    isLocked: state.policyStatus === "locked",
    errorKey: state.policyStatus === "error" ? "errors.generic" : null,
    requestId: state.policyStatus === "error" ? "policy-request" : null,
    retry: state.retry,
  }),
}));
vi.mock("@/components/config-versions/config-versions-workspace", () => ({
  ConfigVersionsWorkspace: ({ canWrite, canImport }: { canWrite: boolean; canImport: boolean }) => (
    <div data-testid="workspace">{`${canWrite}:${canImport}`}</div>
  ),
}));

const renderPage = () => render(<ConfigVersionsPage />, { wrapper: MemoryRouter });

describe("ConfigVersionsPage read-only policy", () => {
  beforeEach(() => {
    state.policyStatus = "unlocked";
    state.retry.mockReset();
  });
  afterEach(cleanup);

  it("enables mutations only after the policy resolves unlocked", () => {
    const { rerender } = renderPage();
    expect(screen.getByTestId("workspace").textContent).toBe("true:true");

    state.policyStatus = "loading";
    rerender(<ConfigVersionsPage />);
    expect(screen.getByTestId("workspace").textContent).toBe("false:false");

    state.policyStatus = "locked";
    rerender(<ConfigVersionsPage />);
    expect(screen.getByTestId("workspace").textContent).toBe("false:false");
    expect(screen.getByText("admin.readOnlyBanner")).toBeTruthy();
  });

  it("keeps mutations disabled and exposes policy retry on an initial error", () => {
    state.policyStatus = "error";
    renderPage();
    expect(screen.getByTestId("workspace").textContent).toBe("false:false");
    expect(screen.getByText("errors.generic")).toBeTruthy();
    expect(screen.getByText("errors.requestId")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ui.retry" }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });
});
