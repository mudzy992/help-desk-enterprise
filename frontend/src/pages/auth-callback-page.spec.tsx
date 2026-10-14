// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthCallbackPage } from "@/pages/auth-callback-page";

const callbackMocks = vi.hoisted(() => ({
  completeEntraRedirect: vi.fn(),
  readRememberedEntraConfiguration: vi.fn(),
  getAuthenticationProviders: vi.fn(),
  signInWithEntra: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/auth/entra-redirect", () => ({
  completeEntraRedirect: callbackMocks.completeEntraRedirect,
  readRememberedEntraConfiguration: callbackMocks.readRememberedEntraConfiguration,
}));

vi.mock("@/lib/session/use-session", () => ({
  useSession: () => ({ signInWithEntra: callbackMocks.signInWithEntra }),
}));

vi.mock("@/services/auth-api", () => ({
  getAuthenticationProviders: callbackMocks.getAuthenticationProviders,
}));

vi.mock("@/components/layout/brand-mark", () => ({ BrandMark: () => null }));

const entraConfiguration = {
  tenantId: "tenant-id",
  clientId: "client-id",
  authority: "https://login.microsoftonline.com/tenant-id",
  singleLogout: false,
};

function LoginLanding() {
  const { state } = useLocation();
  const hasEntraError =
    typeof state === "object" &&
    state !== null &&
    "entraError" in state &&
    state.entraError === true;
  return <p>{hasEntraError ? "login-entra-error" : "login-plain"}</p>;
}

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={["/auth/callback"]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/login" element={<LoginLanding />} />
        <Route path="/tickets" element={<p>tickets-home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    callbackMocks.readRememberedEntraConfiguration.mockReturnValue(entraConfiguration);
    callbackMocks.completeEntraRedirect.mockResolvedValue({
      kind: "token",
      idToken: "entra-id-token",
      returnPath: "/tickets",
    });
    callbackMocks.signInWithEntra.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("exchanges a successful Entra callback and returns to its safe path", async () => {
    renderCallback();

    await screen.findByText("tickets-home");
    expect(callbackMocks.completeEntraRedirect).toHaveBeenCalledWith(entraConfiguration);
    expect(callbackMocks.signInWithEntra).toHaveBeenCalledWith("entra-id-token");
    expect(callbackMocks.getAuthenticationProviders).not.toHaveBeenCalled();
  });

  it("returns a failed Entra callback to login with the error flag", async () => {
    callbackMocks.completeEntraRedirect.mockRejectedValue(new Error("redirect failed"));
    renderCallback();

    await screen.findByText("login-entra-error");
    expect(callbackMocks.signInWithEntra).not.toHaveBeenCalled();
  });
});
