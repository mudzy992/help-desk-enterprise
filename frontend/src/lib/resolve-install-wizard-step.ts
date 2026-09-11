export type InstallWizardStep = "superAdmin" | "loginProvider" | "smtp";

export function resolveInstallWizardStep(input: {
  readonly hasSuperAdmin: boolean;
  readonly isSmtpConfigured: boolean;
  readonly loginProviderSaved: boolean;
}): InstallWizardStep {
  if (!input.hasSuperAdmin) {
    return "superAdmin";
  }
  if (input.loginProviderSaved || input.isSmtpConfigured) {
    return "smtp";
  }
  return "loginProvider";
}
