// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/pages/settings-page";

const state = vi.hoisted(() => ({
  admin: true,
  canWrite: false,
  locked: false,
  readOnlyStatus: "unlocked" as "loading" | "error" | "locked" | "unlocked",
  entries: [{ key: "x" }],
  errorKey: null as string | null,
  requestId: null as string | null,
  isRefreshing: false,
  reload: vi.fn(),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({
    session: state.admin
      ? {
          isSuperAdmin: false,
          roleKeys: ["ADMIN"],
          permissionKeys: state.canWrite ? ["settings.write"] : [],
          principal: { subjectId: "admin-1", isLocalOnly: false },
        }
      : null,
    isLoading: false,
    retry: () => undefined,
    hasRole: (role: string) => state.admin && role === "ADMIN",
    hasPermission: (permission: string) => state.canWrite && permission === "settings.write",
  }),
}));
vi.mock("@/lib/settings/use-settings-registry", () => ({
  useSettingsRegistry: () => ({
    entries: state.entries,
    isLoading: false,
    isRefreshing: state.isRefreshing,
    pendingKeys: new Set(),
    requestId: state.requestId,
    reload: state.reload,
    errorKey: state.errorKey,
    save: vi.fn(),
    saveMany: vi.fn(),
  }),
}));
vi.mock("@/lib/settings/use-admin-module-read-only", () => ({
  adminReadOnlyModuleKeys: { settings: "settings" },
  useAdminModuleReadOnly: () => ({
    status: state.readOnlyStatus,
    isLocked: state.readOnlyStatus === "locked",
    canWrite: state.readOnlyStatus === "unlocked",
    isLoading: state.readOnlyStatus === "loading",
    errorKey: null,
    requestId: null,
    retry: vi.fn(),
  }),
}));
vi.mock("@/components/settings/branding-settings-card", () => ({
  BrandingSettingsCard: ({ canWrite }: { canWrite: boolean }) => (
    <div data-testid="write-state">{String(canWrite)}</div>
  ),
}));
vi.mock("@/components/settings/addons-settings-panel", () => ({ AddonsSettingsPanel: () => null }));
vi.mock("@/components/settings/auth-provider-settings-card", () => ({
  AuthProviderSettingsCard: () => null,
}));
vi.mock("@/components/settings/security-compliance-settings-card", () => ({
  SecurityComplianceSettingsCard: () => null,
}));
vi.mock("@/components/settings/settings-registry-panel", () => ({
  SettingsRegistryPanel: () => null,
}));
vi.mock("@/components/settings/smtp-email-settings-card", () => ({
  SmtpEmailSettingsCard: () => null,
}));
vi.mock("@/components/settings/email-templates-card", () => ({ EmailTemplatesCard: () => null }));
vi.mock("@/components/settings/inbound-email-card", () => ({ InboundEmailCard: () => null }));
vi.mock("@/components/settings/admin-security-pointer-card", () => ({
  AdminSecurityPointerCard: () => null,
}));
vi.mock("@/components/settings/system-settings-card", () => ({ SystemSettingsCard: () => null }));
vi.mock("@/components/settings/unrouted-queue-settings-card", () => ({
  UnroutedQueueSettingsCard: () => null,
}));

describe("SettingsPage access", () => {
  beforeEach(() => {
    state.admin = true;
    state.canWrite = false;
    state.locked = false;
    state.readOnlyStatus = "unlocked";
    state.entries = [{ key: "x" }];
    state.errorKey = null;
    state.requestId = null;
    state.isRefreshing = false;
    state.reload.mockReset();
  });
  afterEach(cleanup);

  it("combines settings.write with read-only mode", () => {
    state.admin = true;
    state.canWrite = true;
    state.locked = true;
    state.readOnlyStatus = "locked";
    render(<SettingsPage />);
    expect(screen.getByTestId("write-state").textContent).toBe("false");
    expect(screen.getByText("admin.readOnlyBanner")).toBeTruthy();
  });

  it("shows the forbidden state without admin access", () => {
    state.admin = false;
    render(<SettingsPage />);
    expect(screen.getByText("settings.forbiddenTitle")).toBeTruthy();
  });

  it.each(["loading", "error"] as const)(
    "keeps write controls disabled while read-only policy is %s",
    (status) => {
      state.canWrite = true;
      state.readOnlyStatus = status;
      render(<SettingsPage />);
      expect(screen.getByTestId("write-state").textContent).toBe("false");
    },
  );

  it("shows initial registry errors with request id and a retry action", () => {
    state.entries = [];
    state.errorKey = "errors.generic";
    state.requestId = "request-17";
    render(<SettingsPage />);

    expect(screen.getByText("errors.generic")).toBeTruthy();
    expect(screen.getByText("errors.requestId")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ui.retry" }));
    expect(state.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps stale registry content visible with a retryable refresh error", () => {
    state.errorKey = "errors.generic";
    state.requestId = "request-18";
    render(<SettingsPage />);

    expect(screen.getByText("errors.generic")).toBeTruthy();
    expect(screen.getByTestId("write-state")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ui.retry" })).toBeTruthy();
  });
});
