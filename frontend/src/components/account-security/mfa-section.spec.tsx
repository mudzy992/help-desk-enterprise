import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MfaSection } from "@/components/account-security/mfa-section";
import type { MfaStatus } from "@/services/account-security-api";

/*
  Paket 5.4.0-e.2: the live review asked whether MFA still has a place once
  passkeys exist. It does — an authenticator code (and the recovery codes) stay
  the second factor, a passkey is added *as another way to prove it*, so the
  account card has to say that in one sentence instead of letting an
  administrator look for a separate switch.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key}|${JSON.stringify(options)}`,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mfa: MfaStatus = {
  requirement: "optional",
  enabled: true,
  enabledAt: "2026-10-01T08:00:00.000Z",
  recoveryCodesRemaining: 8,
  serverConfigured: true,
};

describe("MfaSection", () => {
  it("renders the enabled state with the remaining recovery codes", () => {
    const html = renderToStaticMarkup(<MfaSection mfa={mfa} onChanged={vi.fn()} />);
    expect(html).toContain("account.security.mfaOn");
    expect(html).toContain("account.security.recoveryRemaining");
  });

  it("says nothing about passkeys when the account has none", () => {
    const html = renderToStaticMarkup(<MfaSection mfa={mfa} onChanged={vi.fn()} />);
    expect(html).not.toContain("account.security.mfaPasskeyHint");
    expect(html).not.toContain('data-testid="mfa-passkey-hint"');
  });

  it("explains that a registered passkey is an alternative way to confirm", () => {
    const html = renderToStaticMarkup(
      <MfaSection mfa={mfa} passkeyCount={2} onChanged={vi.fn()} />,
    );
    expect(html).toContain('data-testid="mfa-passkey-hint"');
    expect(html).toContain("account.security.mfaPasskeyHint");
    expect(html).toContain("count&quot;:2");
    // The code itself is still offered — the hint never replaces the controls.
    expect(html).toContain("account.security.regenerateCodes");
  });

  it("keeps the disabled state honest about the requirement", () => {
    const html = renderToStaticMarkup(
      <MfaSection
        mfa={{ ...mfa, enabled: false, recoveryCodesRemaining: 0 }}
        onChanged={vi.fn()}
      />,
    );
    expect(html).toContain("account.security.mfaOff");
    expect(html).not.toContain("account.security.recoveryRemaining");
  });
});
