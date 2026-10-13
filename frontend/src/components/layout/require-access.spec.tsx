// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequireAccess } from "@/components/layout/require-access";
import type { SessionCapabilities } from "@/lib/session/use-session-capabilities";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const capabilities = vi.hoisted(() => ({
  current: { isLoading: false, hasRole: () => false } as Partial<SessionCapabilities>,
}));

vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => capabilities.current,
}));

function renderGuarded() {
  return render(
    <RequireAccess
      check={(access) => access.hasRole?.("SUPER_ADMIN") === true}
      forbiddenTitleKey="admin.forbiddenTitle"
      forbiddenBodyKey="admin.forbiddenBody"
    >
      <p>admin content</p>
    </RequireAccess>,
  );
}

describe("RequireAccess", () => {
  afterEach(() => {
    cleanup();
    capabilities.current = { isLoading: false, hasRole: () => false };
  });

  it("shows a loading skeleton while capabilities are resolving", () => {
    capabilities.current = { isLoading: true };

    renderGuarded();

    expect(screen.getByText("session.loading")).toBeTruthy();
    expect(screen.queryByText("admin content")).toBeNull();
  });

  it("shows the forbidden state when the check fails", () => {
    renderGuarded();

    expect(screen.getByText("admin.forbiddenTitle")).toBeTruthy();
    expect(screen.queryByText("admin content")).toBeNull();
  });

  it("renders children when the check passes", () => {
    capabilities.current = { isLoading: false, hasRole: (role) => role === "SUPER_ADMIN" };

    renderGuarded();

    expect(screen.getByText("admin content")).toBeTruthy();
  });
});
