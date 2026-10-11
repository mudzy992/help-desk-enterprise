import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastProvider } from "@/components/ui/toast";
import { PasskeySection } from "@/components/account-security/passkey-section";
import type { PasskeyView } from "@/services/account-security-api";

/*
  Paket 5.4.0-e: the profile "Passkey" card. The spec renders without a browser
  and asserts the two rules a list must never break: a raw credential row id is
  not printed (it may appear only inside a title attribute) and the empty list
  says so instead of rendering a bare button.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

const passkey: PasskeyView = {
  id: "clx-row-cuid-1",
  deviceName: "Laptop u uredu",
  aaguid: "08987058-cadc-4b81-b6e1-30de50dcbe96",
  createdAt: "2026-10-01T09:00:00.000Z",
  lastUsedAt: "2026-10-10T08:30:00.000Z",
  isBackedUp: true,
};

function render(passkeys: readonly PasskeyView[], canUsePasskeys = true) {
  return renderToStaticMarkup(
    <ToastProvider>
      <PasskeySection
        passkeys={passkeys}
        hasTotp
        canUsePasskeys={canUsePasskeys}
        onChanged={() => undefined}
      />
    </ToastProvider>,
  );
}

describe("PasskeySection", () => {
  it("renders the empty state and the add button", () => {
    const html = render([]);
    expect(html).toContain("account.passkeys.empty");
    expect(html).toContain("account.passkeys.add");
  });

  it("lists a credential with its label, kind, times and backup flag — without the raw row id", () => {
    const html = render([passkey]);
    expect(html).toContain("Laptop u uredu");
    expect(html).toContain("account.passkeys.kinds.windows_hello");
    expect(html).toContain("account.passkeys.backedUp");
    expect(html).toContain("account.passkeys.rename");
    expect(html).toContain("account.passkeys.remove");
    // The identifier may be a tooltip, never visible text.
    expect(html.replace(/title="[^"]*"/g, "")).not.toContain("clx-row-cuid-1");
  });

  it("marks a passkey that was never used", () => {
    const html = render([{ ...passkey, lastUsedAt: null, deviceName: null, isBackedUp: false }]);
    expect(html).toContain("account.passkeys.kinds.windows_hello");
    expect(html).toContain("account.passkeys.neverUsed");
    expect(html).not.toContain("account.passkeys.backedUp");
  });

  it("says the browser cannot use passkeys instead of offering a broken ceremony", () => {
    const html = render([], false);
    expect(html).toContain("account.passkeys.unsupported");
    expect(html).not.toContain("account.passkeys.add");
  });
});
