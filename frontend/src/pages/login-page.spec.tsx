// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import { LoginPage } from "@/pages/login-page";
import type { CaptchaDescription } from "@/services/auth-api";

type CaptchaLoadState = "loading" | "ready" | "unavailable";

const authMocks = vi.hoisted(() => ({
  getAuthenticationProviders: vi.fn(),
  signIn: vi.fn(),
  completePasswordChange: vi.fn(),
  completeMfa: vi.fn(),
  completeMfaWithPasskey: vi.fn(),
  confirmMfaEnrollment: vi.fn(),
  startEntraSignIn: vi.fn(),
  startPasskeyLogin: vi.fn(),
  startSignInMfaEnrollment: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/session/use-session", () => ({
  useSession: () => ({
    session: null,
    signIn: authMocks.signIn,
    completePasswordChange: authMocks.completePasswordChange,
    completeMfa: authMocks.completeMfa,
    completeMfaWithPasskey: authMocks.completeMfaWithPasskey,
    confirmMfaEnrollment: authMocks.confirmMfaEnrollment,
  }),
}));

vi.mock("@/services/auth-api", () => ({
  fallbackMinimumPasswordLength: 12,
  getAuthenticationProviders: authMocks.getAuthenticationProviders,
  startPasskeyLogin: authMocks.startPasskeyLogin,
  startSignInMfaEnrollment: authMocks.startSignInMfaEnrollment,
}));

vi.mock("@/lib/auth/entra-redirect", () => ({
  safeReturnPath: (value: string | null | undefined) =>
    typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/",
  startEntraSignIn: authMocks.startEntraSignIn,
}));

vi.mock("@/lib/branding/branding-store", () => ({
  useBranding: () => ({ appName: "Service Desk", tagline: "" }),
}));

vi.mock("@/components/layout/brand-mark", () => ({ BrandMark: () => null }));
vi.mock("@/components/layout/locale-select", () => ({ LocaleSelect: () => null }));
vi.mock("@/lib/webauthn/use-passkey-availability", () => ({
  usePlatformPasskeyAvailable: () => ({ available: false, isLoading: false }),
}));

vi.mock("@/components/auth/captcha-challenge", async () => {
  const React = await import("react");
  return {
    CaptchaChallenge: ({
      siteKey,
      onToken,
      onLoadState,
    }: {
      readonly siteKey: string;
      readonly onToken: (token: string | null) => void;
      readonly onLoadState?: (state: CaptchaLoadState) => void;
    }) => {
      React.useEffect(() => {
        onLoadState?.("ready");
      }, [onLoadState]);
      return React.createElement(
        "button",
        {
          type: "button",
          "aria-label": "solve human check",
          "data-site-key": siteKey,
          onClick: () => onToken("captcha-token"),
        },
        "solve",
      );
    },
  };
});

function localProviders(captcha?: CaptchaDescription) {
  return {
    mode: "local" as const,
    entra: null,
    ...(captcha === undefined ? {} : { captcha }),
  };
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<p>login-finished</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submitCredentials() {
  fireEvent.change(screen.getByLabelText("session.email"), {
    target: { value: "person@example.test" },
  });
  fireEvent.change(screen.getByLabelText("session.password"), {
    target: { value: "correct-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "session.signIn" }));
}

describe("LoginPage auth paths", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.getAuthenticationProviders.mockResolvedValue(localProviders());
    authMocks.signIn.mockResolvedValue({ kind: "authenticated" });
    authMocks.completePasswordChange.mockResolvedValue({ kind: "authenticated" });
    authMocks.completeMfa.mockResolvedValue(undefined);
    authMocks.completeMfaWithPasskey.mockResolvedValue(undefined);
    authMocks.confirmMfaEnrollment.mockResolvedValue({ recoveryCodes: [], finish: vi.fn() });
  });

  afterEach(() => {
    cleanup();
  });

  it("submits local credentials and completes the sign-in", async () => {
    renderLogin();
    await submitCredentials();

    await screen.findByText("login-finished");
    expect(authMocks.signIn).toHaveBeenCalledWith(
      "person@example.test",
      "correct-password",
      false,
      undefined,
    );
  });

  it("keeps the accepted A14 local-form fail-open behavior when provider discovery fails", async () => {
    let rejectProviders: (error: Error) => void = () => undefined;
    authMocks.getAuthenticationProviders.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectProviders = reject;
      }),
    );
    renderLogin();
    await waitFor(() => expect(authMocks.getAuthenticationProviders).toHaveBeenCalledTimes(1));
    await act(async () => {
      rejectProviders(new Error("providers unavailable"));
      await Promise.resolve();
    });

    await submitCredentials();

    await screen.findByText("login-finished");
    expect(authMocks.signIn).toHaveBeenCalledWith(
      "person@example.test",
      "correct-password",
      false,
      undefined,
    );
  });

  it("blocks credentials until a requested CAPTCHA has a token", async () => {
    authMocks.getAuthenticationProviders.mockResolvedValue(
      localProviders({ provider: "turnstile", siteKey: "site-key", afterFailures: 5 }),
    );
    authMocks.signIn
      .mockRejectedValueOnce(new ApiError(400, "CAPTCHA_REQUIRED", "required"))
      .mockResolvedValueOnce({ kind: "authenticated" });
    renderLogin();

    await submitCredentials();
    const submit = await screen.findByRole("button", { name: "session.signIn" });
    expect(await screen.findByText("session.captchaBlocked")).toBeTruthy();
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "solve human check" }));
    await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
    fireEvent.click(submit);

    await screen.findByText("login-finished");
    expect(authMocks.signIn).toHaveBeenLastCalledWith(
      "person@example.test",
      "correct-password",
      false,
      "captcha-token",
    );
  });

  it("shows CAPTCHA unavailable and blocks credentials when CAPTCHA_REQUIRED has no site key", async () => {
    authMocks.getAuthenticationProviders.mockResolvedValue(
      localProviders({ provider: "turnstile", siteKey: null, afterFailures: 5 }),
    );
    authMocks.signIn.mockRejectedValue(new ApiError(400, "CAPTCHA_REQUIRED", "required"));
    renderLogin();

    await submitCredentials();

    const submit = await screen.findByRole("button", { name: "session.signIn" });
    expect(await screen.findByText("session.captchaUnavailable")).toBeTruthy();
    expect(screen.queryByText("session.captchaBlocked")).toBeNull();
    expect(submit.hasAttribute("disabled")).toBe(true);
  });

  it("blocks the MFA code when CAPTCHA_REQUIRED arrives without a site key", async () => {
    authMocks.getAuthenticationProviders.mockResolvedValue(
      localProviders({ provider: "turnstile", siteKey: null, afterFailures: 5 }),
    );
    authMocks.signIn.mockResolvedValue({ kind: "mfa_required", mfaToken: "mfa-token" });
    authMocks.completeMfa.mockRejectedValue(new ApiError(400, "CAPTCHA_REQUIRED", "required"));
    renderLogin();

    await submitCredentials();
    const code = await screen.findByLabelText("auth.mfa.codeLabel");
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.mfa.verify" }));

    const submit = await screen.findByRole("button", { name: "auth.mfa.verify" });
    expect(await screen.findByText("session.captchaUnavailable")).toBeTruthy();
    expect(screen.queryByText("session.captchaBlocked")).toBeNull();
    expect(screen.queryByText("auth.mfa.captchaRequired")).toBeNull();
    expect(submit.hasAttribute("disabled")).toBe(true);
  });
});
