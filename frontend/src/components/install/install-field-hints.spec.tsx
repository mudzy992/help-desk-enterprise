// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallEntraAdFields } from "@/components/install/install-entra-ad-fields";
import { InstallLdapsBindFields } from "@/components/install/install-ldaps-bind-fields";
import { InstallSmtpFields } from "@/components/install/install-smtp-fields";
import { InstallSuperAdminStep } from "@/components/install/install-super-admin-step";
import { loadInstallPasswordPolicy, loadInstallSuperAdmin } from "@/services/install-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/install-api", () => ({
  loadInstallSuperAdmin: vi.fn(),
  loadInstallPasswordPolicy: vi.fn(),
}));

/*
  IN11: a hint that explains a field has to travel with the field. A `<span>` next
  to an input is invisible to a screen reader that reached the input; text *inside*
  a `<label>` is worse — it becomes part of the control's accessible name. Every
  case here pins one half of the link: the id on the hint, the id in the input's
  `aria-describedby`.
*/

function noop() {}

function describedBy(element: HTMLElement): readonly string[] {
  const ids = element.getAttribute("aria-describedby");
  return ids === null ? [] : ids.split(" ").filter((id) => id.length > 0);
}

function hintTextOf(element: HTMLElement): string {
  return describedBy(element)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();
}

beforeEach(() => {
  vi.mocked(loadInstallSuperAdmin).mockResolvedValue({ superAdmin: null });
  vi.mocked(loadInstallPasswordPolicy).mockResolvedValue({
    minLength: 12,
    maxLength: 72,
    blocklistEnabled: true,
  });
});

afterEach(() => {
  cleanup();
  vi.mocked(loadInstallSuperAdmin).mockReset();
  vi.mocked(loadInstallPasswordPolicy).mockReset();
});

describe("install wizard field hints (IN11)", () => {
  it("links the SMTP password hint to the empty password box", () => {
    render(
      <InstallSmtpFields
        host="smtp.example.com"
        port="587"
        tls
        username="mailer"
        password=""
        fromAddress="helpdesk@example.com"
        passwordConfigured
        onHostChange={noop}
        onPortChange={noop}
        onTlsChange={noop}
        onUsernameChange={noop}
        onPasswordChange={noop}
        onFromAddressChange={noop}
      />,
    );

    expect(hintTextOf(screen.getByLabelText("install.smtp.password"))).toBe(
      "install.smtp.configured",
    );
  });

  it("describes the Entra fields without putting the hint into their names", () => {
    render(
      <InstallEntraAdFields
        tenantId=""
        clientId=""
        tenantIdConfigured
        clientIdConfigured
        tenantIdLabel="install.loginProvider.tenant"
        clientIdLabel="install.loginProvider.client"
        configuredLabel="install.loginProvider.configured"
        onTenantIdChange={noop}
        onClientIdChange={noop}
      />,
    );

    for (const label of ["install.loginProvider.tenant", "install.loginProvider.client"]) {
      const input = screen.getByLabelText(label);
      expect(input.getAttribute("aria-label")).toBeNull();
      expect(input.closest("label")?.textContent).toBe(label);
      expect(hintTextOf(input)).toBe("install.loginProvider.configured");
    }
  });

  it("describes the directory bind fields", () => {
    render(
      <InstallLdapsBindFields
        urls="ldaps://dc.example.com"
        bindDn=""
        bindPassword=""
        bindDnConfigured
        bindPasswordConfigured
        urlsLabel="install.loginProvider.ldapsUrls"
        bindDnLabel="install.loginProvider.bindDn"
        bindPasswordLabel="install.loginProvider.bindPassword"
        configuredLabel="install.loginProvider.configured"
        onUrlsChange={noop}
        onBindDnChange={noop}
        onBindPasswordChange={noop}
      />,
    );

    for (const label of ["install.loginProvider.bindDn", "install.loginProvider.bindPassword"]) {
      expect(hintTextOf(screen.getByLabelText(label))).toBe("install.loginProvider.configured");
    }
  });

  it("describes the founder password with the length rule", async () => {
    render(<InstallSuperAdminStep />);

    const password = await screen.findByLabelText("install.password");
    await waitFor(() => expect(hintTextOf(password)).toContain("install.passwordHintBlocklist"));
    expect(hintTextOf(screen.getByLabelText("install.confirmPassword"))).toContain(
      "install.passwordHintBlocklist",
    );
  });
});
