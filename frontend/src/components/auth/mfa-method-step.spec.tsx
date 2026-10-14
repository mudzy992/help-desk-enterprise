import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MfaMethodStep } from "@/components/auth/mfa-method-step";

/*
  Paket 5.4.0-e: the second factor step must keep the pre-passkey behaviour for
  a server that does not announce `methods` — the choice buttons appear only
  when the account offers a passkey and the browser can run the ceremony.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

const canUsePasskeys = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/webauthn/use-passkey-availability", () => ({
  usePlatformPasskeyAvailable: () => ({ available: canUsePasskeys.value, isLoading: false }),
}));
vi.mock("@/lib/webauthn/passkey-ceremony", () => ({
  getPasskeyAssertion: () => Promise.resolve({ kind: "cancelled" as const }),
}));

function render(
  methods?: readonly ("totp" | "passkey")[],
  defaultMethod: "totp" | "passkey" = "totp",
) {
  return renderToStaticMarkup(
    <MfaMethodStep
      email="ana@example.org"
      token="mfa-token"
      methods={methods}
      defaultMethod={defaultMethod}
      onVerifyCode={() => Promise.resolve()}
      onCompletePasskey={() => Promise.resolve()}
      onVerified={() => undefined}
      onCancel={() => undefined}
    />,
  );
}

describe("MfaMethodStep", () => {
  it("keeps the code-only form when the server sends no methods (older server)", () => {
    canUsePasskeys.value = true;
    const html = render(undefined);
    expect(html).toContain("auth.mfa.codeLabel");
    expect(html).not.toContain("auth.mfa.methodPasskey");
  });

  it("keeps the code-only form when the account has no passkey", () => {
    canUsePasskeys.value = true;
    const html = render(["totp"]);
    expect(html).toContain("auth.mfa.codeLabel");
    expect(html).not.toContain("auth.mfa.methodPasskey");
  });

  it("keeps the code-only form when the browser cannot run a ceremony", () => {
    canUsePasskeys.value = false;
    const html = render(["totp", "passkey"]);
    expect(html).toContain("auth.mfa.codeLabel");
    expect(html).not.toContain("auth.mfa.methodPasskey");
  });

  it("offers both factors and opens on the remembered one", () => {
    canUsePasskeys.value = true;
    const html = render(["totp", "passkey"], "passkey");
    expect(html).toContain("auth.mfa.methodTotp");
    expect(html).toContain("auth.mfa.methodPasskey");
    expect(html).toContain("auth.mfa.passkeyIntro");
    expect(html).toContain("auth.mfa.usePasskey");
    // The passkey branch replaces the code input entirely.
    expect(html).not.toContain("auth.mfa.codeLabel");
  });

  it("still opens on the remembered TOTP when that was the last choice", () => {
    canUsePasskeys.value = true;
    const html = render(["totp", "passkey"], "totp");
    expect(html).toContain("auth.mfa.methodPasskey");
    expect(html).toContain("auth.mfa.codeLabel");
    expect(html).not.toContain("auth.mfa.passkeyIntro");
  });

  /*
    Paket 5.4.1 closeout (M3, MFA korak): the human check sits above the code
    field and holds the submit button until it is solved. The passkey branch
    never shows it — a passkey is not guessable.
  */
  it("shows the human check above the code field and holds submit until it is solved", () => {
    canUsePasskeys.value = false;
    const html = renderToStaticMarkup(
      <MfaMethodStep
        email="ana@example.org"
        token="mfa-token"
        methods={["totp"]}
        defaultMethod="totp"
        onVerifyCode={() => Promise.resolve()}
        onCompletePasskey={() => Promise.resolve()}
        onVerified={() => undefined}
        onCancel={() => undefined}
        captcha={<div data-testid="captcha-slot">challenge</div>}
        isCaptchaBlocked
      />,
    );
    expect(html).toContain("captcha-slot");
    // Order: the code field, then the human check, then the submit button.
    expect(html.indexOf("auth.mfa.codeLabel")).toBeLessThan(html.indexOf("captcha-slot"));
    expect(html.indexOf("captcha-slot")).toBeLessThan(html.indexOf('type="submit"'));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("does not render the human check when the server did not ask for one", () => {
    canUsePasskeys.value = false;
    const html = render(["totp"]);
    expect(html).not.toContain("captcha-slot");
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});
