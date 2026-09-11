export type InstallWizardStep =
  | "superAdmin"
  | "loginProvider"
  | "smtp"
  | "seed";

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
  return "seed";
}
