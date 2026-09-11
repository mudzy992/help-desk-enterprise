export type InstallWizardStep =
  | "superAdmin"
  | "loginProvider"
  | "smtp"
  | "seed"
  | "addons"
  | "complete";

export function resolveInstallWizardStep(input: {
  readonly hasSuperAdmin: boolean;
  readonly isSmtpConfigured: boolean;
  readonly loginProviderSaved: boolean;
  readonly isSeeded: boolean;
}): InstallWizardStep {
  if (!input.hasSuperAdmin) {
    return "superAdmin";
  }
  if (
    !input.loginProviderSaved &&
    !input.isSmtpConfigured &&
    !input.isSeeded
  ) {
    return "loginProvider";
  }
  if (!input.isSmtpConfigured && !input.isSeeded) {
    return "smtp";
  }
  if (!input.isSeeded) {
    return "seed";
  }
  return "addons";
}

export const installWizardCopyKeys = {
  superAdmin: { heading: "install.heading", body: "install.body" },
  loginProvider: {
    heading: "install.loginProvider.heading",
    body: "install.loginProvider.body",
  },
  smtp: { heading: "install.smtp.heading", body: "install.smtp.body" },
  seed: { heading: "install.seed.heading", body: "install.seed.body" },
  addons: { heading: "install.addons.heading", body: "install.addons.body" },
  complete: {
    heading: "install.complete.heading",
    body: "install.complete.body",
  },
} as const;
