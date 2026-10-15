import { ApiError } from "@/services/api";

/**
 * Install wizard v2 (F4.1): a failed „Pošalji test“ is the only place the wizard
 * shows what the mail server actually answered. The backend maps the SMTP code to
 * one of these codes; here they become the sentence the operator can act on.
 */
export type InstallSmtpTestErrorKey =
  | "install.smtp.test.errorNotConfigured"
  | "install.smtp.test.errorInvalidRecipient"
  | "install.smtp.test.errorAuth"
  | "install.smtp.test.errorTls"
  | "install.smtp.test.errorTimeout"
  | "install.smtp.test.errorUnreachable"
  | "install.smtp.test.errorSend"
  | "install.smtp.test.errorRateLimited"
  | "install.smtp.test.errorSuperAdmin"
  | "install.smtp.test.errorGeneric";

export function mapInstallSmtpTestError(error: unknown): InstallSmtpTestErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.smtp.test.errorGeneric";
  }
  switch (error.code) {
    case "SMTP_TEST_NOT_CONFIGURED":
      return "install.smtp.test.errorNotConfigured";
    case "SMTP_TEST_INVALID_RECIPIENT":
      return "install.smtp.test.errorInvalidRecipient";
    case "SMTP_TEST_AUTH_FAILED":
      return "install.smtp.test.errorAuth";
    case "SMTP_TEST_TLS_FAILED":
      return "install.smtp.test.errorTls";
    case "SMTP_TEST_TIMEOUT":
      return "install.smtp.test.errorTimeout";
    case "SMTP_TEST_UNREACHABLE":
      return "install.smtp.test.errorUnreachable";
    case "SMTP_TEST_SEND_FAILED":
      return "install.smtp.test.errorSend";
    case "SMTP_TEST_RATE_LIMITED":
      return "install.smtp.test.errorRateLimited";
    case "SUPER_ADMIN_REQUIRED":
      return "install.smtp.test.errorSuperAdmin";
    default:
      return "install.smtp.test.errorGeneric";
  }
}
