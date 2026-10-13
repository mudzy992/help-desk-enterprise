// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequireAuth } from "@/components/layout/require-auth";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/session/use-session", () => ({
  useSession: () => ({ session: null, signOut: vi.fn() }),
  expireSession: vi.fn(),
  notifySessionRefreshed: vi.fn(),
}));

vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({ session: null, isLoading: false }),
}));

vi.mock("@/lib/session/session-keep-alive", () => ({
  startSessionKeepAlive: () => () => undefined,
}));

vi.mock("@/services/api", () => ({
  setUnauthorizedHandler: vi.fn(),
}));

vi.mock("@/services/user-preferences-api", () => ({
  getUserPreferences: vi.fn(() => new Promise(() => undefined)),
  updateUserPreferences: vi.fn(),
}));

function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "none";
  return <p data-testid="login-from">{from}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route element={<RequireAuth />}>
          <Route path="*" element={<p>protected</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the query string and hash when sending an anonymous user to sign in", () => {
    renderAt("/tickets?view=all#row-42");

    expect(screen.getByTestId("login-from").textContent).toBe("/tickets?view=all#row-42");
  });

  it("keeps the plain pathname when there is no query or hash", () => {
    renderAt("/reports");

    expect(screen.getByTestId("login-from").textContent).toBe("/reports");
  });
});
