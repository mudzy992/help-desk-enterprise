import { describe, expect, it } from "vitest";
import { resolveInstallWizardStep } from "@/lib/resolve-install-wizard-step";

describe("resolveInstallWizardStep", () => {
  it("stays on SuperAdmin until that account exists", () => {
    expect(
      resolveInstallWizardStep({
        hasSuperAdmin: false,
        isSmtpConfigured: false,
        loginProviderSaved: false,
      }),
    ).toBe("superAdmin");
  });

  it("shows SMTP after login provider save or a stored SMTP step", () => {
    expect(
      resolveInstallWizardStep({
        hasSuperAdmin: true,
        isSmtpConfigured: false,
        loginProviderSaved: true,
      }),
    ).toBe("smtp");
    expect(
      resolveInstallWizardStep({
        hasSuperAdmin: true,
        isSmtpConfigured: true,
        loginProviderSaved: false,
      }),
    ).toBe("smtp");
  });

  it("shows login provider after SuperAdmin and before SMTP", () => {
    expect(
      resolveInstallWizardStep({
        hasSuperAdmin: true,
        isSmtpConfigured: false,
        loginProviderSaved: false,
      }),
    ).toBe("loginProvider");
  });
});
