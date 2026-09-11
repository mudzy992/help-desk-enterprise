import { describe, expect, it } from "vitest";
import { resolveInstallWizardStep } from "@/lib/resolve-install-wizard-step";

describe("resolveInstallWizardStep", () => {
  it("stays on SuperAdmin until that account exists", () => {
    expect(
      resolveInstallWizardStep({
        hasSuperAdmin: false,
        isSmtpConfigured: false,
        loginProviderSaved: false,
        isSeeded: false,
      }),
    ).toBe("superAdmin");
  });

  it("shows login provider after SuperAdmin and before SMTP", () => {
    expect(
      resolveInstallWizardStep({
        hasSuperAdmin: true,
        isSmtpConfigured: false,
        loginProviderSaved: false,
        isSeeded: false,
      }),
    ).toBe("loginProvider");
  });

  it("shows SMTP after login provider save and before seed", () => {
    expect(
      resolveInstallWizardStep({
        hasSuperAdmin: true,
        isSmtpConfigured: false,
        loginProviderSaved: true,
        isSeeded: false,
      }),
    ).toBe("smtp");
  });

  it("shows seed after SMTP is configured and before seed exists", () => {
    expect(
      resolveInstallWizardStep({
        hasSuperAdmin: true,
        isSmtpConfigured: true,
        loginProviderSaved: false,
        isSeeded: false,
      }),
    ).toBe("seed");
  });

  it("shows addons after seed is complete", () => {
    expect(
      resolveInstallWizardStep({
        hasSuperAdmin: true,
        isSmtpConfigured: true,
        loginProviderSaved: true,
        isSeeded: true,
      }),
    ).toBe("addons");
  });
});
