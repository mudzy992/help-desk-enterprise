// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/pages/settings-page";

const state = vi.hoisted(() => ({ admin: true, canWrite: false, locked: false }));
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
    entries: [{ key: "x" }],
    isLoading: false,
    pendingKey: null,
    errorKey: null,
    save: vi.fn(),
    saveMany: vi.fn(),
  }),
}));
vi.mock("@/lib/settings/use-admin-module-read-only", () => ({
  adminReadOnlyModuleKeys: { settings: "settings" },
  useAdminModuleReadOnly: () => ({ isLocked: state.locked, isLoading: false }),
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
  it("combines settings.write with read-only mode", () => {
    state.admin = true;
    state.canWrite = true;
    state.locked = true;
    render(<SettingsPage />);
    expect(screen.getByTestId("write-state").textContent).toBe("false");
    expect(screen.getByText("admin.readOnlyBanner")).toBeTruthy();
  });

  it("shows the forbidden state without admin access", () => {
    state.admin = false;
    state.canWrite = false;
    state.locked = false;
    render(<SettingsPage />);
    expect(screen.getByText("settings.forbiddenTitle")).toBeTruthy();
  });
});
