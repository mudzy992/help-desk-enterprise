// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequireAuth } from "@/components/layout/require-auth";
import { notifySessionRefreshed } from "@/lib/session/use-session";
import { logoutSession } from "@/services/auth-api";
import { getCurrentSession, type CurrentSessionResponse } from "@/services/session-api";
import { readStoredSession, writeStoredSession } from "@/services/session-store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("i18next", () => ({
  default: { language: "bs", changeLanguage: vi.fn(), on: vi.fn() },
}));

vi.mock("@/i18n/locale", () => ({
  parseLocale: () => "bs",
  persistLocale: vi.fn(),
}));

vi.mock("@/i18n/locale-preference-sync", () => ({
  decideLocaleSync: () => ({ action: "none" }),
}));

vi.mock("@/lib/session/session-keep-alive", () => ({
  startSessionKeepAlive: () => () => undefined,
}));

vi.mock("@/services/api", () => ({
  setUnauthorizedHandler: vi.fn(),
}));

vi.mock("@/services/auth-api", () => ({
  logoutSession: vi.fn(() => Promise.resolve()),
  refreshSession: vi.fn(),
}));

vi.mock("@/services/session-api", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/services/user-preferences-api", () => ({
  getUserPreferences: vi.fn(() => new Promise(() => undefined)),
  updateUserPreferences: vi.fn(),
}));

const principal = {
  subjectId: "user-1",
  email: "agent@example.test",
  displayName: "Agent",
  isLocalOnly: true,
};

const currentSession: CurrentSessionResponse = {
  principal,
  isSuperAdmin: false,
  roleKeys: ["AGENT"],
  permissionKeys: [],
  organizationalUnitId: null,
  organizationalUnitName: null,
};

function PageMountProbe({ onMount }: { readonly onMount: () => void }) {
  useEffect(() => {
    onMount();
  }, [onMount]);
  return <p>protected page</p>;
}

function renderProtected(onMount: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tickets"]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="*" element={<PageMountProbe onMount={onMount} />} />
          </Route>
          <Route path="/login" element={<p>login</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RequireAuth session handling", () => {
  beforeEach(() => {
    window.localStorage.clear();
    writeStoredSession({ expiresAt: Date.now() + 3_600_000, principal });
    vi.mocked(getCurrentSession).mockReset();
    vi.mocked(logoutSession).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the session when /auth/session fails with a network error (A1)", async () => {
    vi.mocked(getCurrentSession).mockRejectedValue(new TypeError("Failed to fetch"));

    renderProtected(() => undefined);

    await screen.findByRole("alert");
    expect(logoutSession).not.toHaveBeenCalled();
    expect(readStoredSession()).not.toBeNull();
    expect(screen.queryByText("login")).toBeNull();
  });

  it("does not unmount the page when the access token is refreshed (A2)", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(currentSession);
    const onMount = vi.fn();

    renderProtected(onMount);
    await screen.findByText("protected page");
    expect(onMount).toHaveBeenCalledTimes(1);

    act(() => {
      writeStoredSession({ expiresAt: Date.now() + 3_600_000, principal });
      notifySessionRefreshed();
    });

    await waitFor(() => expect(screen.getByText("protected page")).toBeTruthy());
    expect(onMount).toHaveBeenCalledTimes(1);
  });
});
