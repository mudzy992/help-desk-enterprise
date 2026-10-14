// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordExpiryBanner } from "@/components/account-security/password-expiry-banner";
import type { AccountSecurityOverview } from "@/services/account-security-api";

const securityMocks = vi.hoisted(() => ({ getAccountSecurity: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/account-security-api", () => ({
  getAccountSecurity: securityMocks.getAccountSecurity,
}));

const overview: AccountSecurityOverview = {
  mfa: {
    requirement: "optional",
    enabled: false,
    enabledAt: null,
    recoveryCodesRemaining: 0,
    serverConfigured: true,
  },
  passkeys: [],
  hasTotp: false,
  password: {
    hasLocalPassword: true,
    changedAt: null,
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    minLength: 12,
    blocklistEnabled: false,
    historyCount: 0,
  },
};

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PasswordExpiryBanner />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("PasswordExpiryBanner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    securityMocks.getAccountSecurity.mockResolvedValue(overview);
  });

  afterEach(() => {
    cleanup();
  });

  it("loads account security and warns when the password expires within two weeks", async () => {
    const { client } = renderBanner();

    const banner = await screen.findByRole("status");
    expect(banner.textContent).toContain("account.security.expiryBanner");
    expect(
      screen.getByRole("link", { name: "account.security.expiryBannerLink" }).getAttribute("href"),
    ).toBe("/account/security");
    expect(securityMocks.getAccountSecurity).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
