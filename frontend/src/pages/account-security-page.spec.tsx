// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSecurityPage } from "@/pages/account-security-page";
import {
  getAccountSecurity,
  listOwnSessions,
  revokeOtherSessions,
  revokeOwnSession,
  type AccountSecurityOverview,
  type UserSession,
} from "@/services/account-security-api";

const toast = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/i18n/use-locale", () => ({ useLocale: () => ({ locale: "bs" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/webauthn/use-passkey-availability", () => ({
  usePlatformPasskeyAvailable: () => ({ isLoading: false, available: true }),
}));
vi.mock("@/components/account-security/mfa-section", () => ({
  MfaSection: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" onClick={onChanged}>
      mfa-changed
    </button>
  ),
}));
vi.mock("@/components/account-security/passkey-section", () => ({
  PasskeySection: () => <div>passkey-section</div>,
}));
vi.mock("@/components/account-security/password-section", () => ({
  PasswordSection: () => <div>password-section</div>,
}));
vi.mock("@/services/account-security-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/account-security-api")>();
  return {
    ...actual,
    getAccountSecurity: vi.fn(),
    listOwnSessions: vi.fn(),
    revokeOwnSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
  };
});

const overview: AccountSecurityOverview = {
  mfa: {
    requirement: "optional",
    enabled: true,
    enabledAt: "2026-10-01T08:00:00.000Z",
    recoveryCodesRemaining: 8,
    serverConfigured: true,
  },
  passkeys: [],
  hasTotp: true,
  password: {
    hasLocalPassword: true,
    changedAt: "2026-10-01T08:00:00.000Z",
    expiresAt: null,
    minLength: 12,
    blocklistEnabled: true,
    historyCount: 5,
  },
};

const currentSession: UserSession = {
  id: "session-current",
  provider: "local",
  mfaMethod: "totp",
  ipAddress: "127.0.0.1",
  userAgent: "Mozilla/5.0 Chrome/140.0",
  createdAt: "2026-10-19T08:00:00.000Z",
  lastSeenAt: "2026-10-19T09:00:00.000Z",
  expiresAt: "2026-10-19T10:00:00.000Z",
  current: true,
};
const otherSession: UserSession = {
  ...currentSession,
  id: "session-other",
  ipAddress: "192.0.2.10",
  current: false,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AccountSecurityPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("AccountSecurityPage query model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccountSecurity).mockResolvedValue(overview);
    vi.mocked(listOwnSessions).mockResolvedValue({ items: [currentSession, otherSession] });
    vi.mocked(revokeOwnSession).mockResolvedValue();
    vi.mocked(revokeOtherSessions).mockResolvedValue({ revoked: 1 });
  });

  afterEach(() => cleanup());

  it("loads the overview and active sessions in parallel", async () => {
    const overviewRequest = deferred<AccountSecurityOverview>();
    const sessionsRequest = deferred<{ items: readonly UserSession[] }>();
    vi.mocked(getAccountSecurity).mockReturnValueOnce(overviewRequest.promise);
    vi.mocked(listOwnSessions).mockReturnValueOnce(sessionsRequest.promise);

    renderPage();
    expect(screen.getAllByText("account.security.loading").length).toBeGreaterThanOrEqual(1);

    overviewRequest.resolve(overview);
    sessionsRequest.resolve({ items: [currentSession, otherSession] });

    expect(await screen.findByText("mfa-changed")).toBeTruthy();
    expect(await screen.findByTestId("sessions-list")).toBeTruthy();
  });

  it("offers a sessions-specific retry after a partial load failure", async () => {
    vi.mocked(listOwnSessions)
      .mockRejectedValueOnce(new Error("sessions unavailable"))
      .mockResolvedValueOnce({ items: [currentSession] });

    renderPage();
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "account.security.retry" }));

    expect(await screen.findByTestId("sessions-list")).toBeTruthy();
    expect(listOwnSessions).toHaveBeenCalledTimes(2);
  });

  it("confirms one-session revocation and refreshes the sessions query", async () => {
    renderPage();
    await screen.findByTestId("sessions-list");

    fireEvent.click(screen.getByRole("button", { name: "account.security.revokeSession" }));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    await waitFor(() => expect(revokeOwnSession).toHaveBeenCalledWith("session-other"));
    await waitFor(() => expect(listOwnSessions).toHaveBeenCalledTimes(2));
    expect(toast).toHaveBeenCalledWith({
      tone: "success",
      title: "account.security.sessionRevoked",
    });
  });

  it("keeps the selected session busy and reports a revoke failure", async () => {
    const revocation = deferred<void>();
    vi.mocked(revokeOwnSession).mockReturnValueOnce(revocation.promise);
    renderPage();
    await screen.findByTestId("sessions-list");

    fireEvent.click(screen.getByRole("button", { name: "account.security.revokeSession" }));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    const revokeButton = screen.getByRole("button", { name: "account.security.revokeSession" });
    await waitFor(() => expect(revokeButton.hasAttribute("disabled")).toBe(true));
    revocation.reject(new Error("revoke failed"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        tone: "danger",
        title: "account.security.actionFailed",
      }),
    );
    expect(revokeButton.hasAttribute("disabled")).toBe(false);
    expect(listOwnSessions).toHaveBeenCalledOnce();
  });

  it("confirms bulk revocation and refreshes the sessions query", async () => {
    renderPage();
    const revokeOthers = await screen.findByRole("button", {
      name: "account.security.revokeOthers",
    });

    fireEvent.click(revokeOthers);
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    await waitFor(() => expect(revokeOtherSessions).toHaveBeenCalledOnce());
    await waitFor(() => expect(listOwnSessions).toHaveBeenCalledTimes(2));
    expect(toast).toHaveBeenCalledWith({
      tone: "success",
      title: "account.security.othersRevoked",
    });
  });

  it("invalidates both page queries after a child security change", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "mfa-changed" }));

    await waitFor(() => expect(getAccountSecurity).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(listOwnSessions).toHaveBeenCalledTimes(2));
  });
});
