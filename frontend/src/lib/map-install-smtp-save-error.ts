import { ApiError } from "@/services/api";

export type InstallSmtpErrorKey =
  | "install.smtp.errorIncomplete"
  | "install.smtp.errorInvalid"
  | "install.smtp.errorSuperAdmin"
  | "install.smtp.errorGeneric";

export function mapInstallSmtpSaveError(error: unknown): InstallSmtpErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.smtp.errorGeneric";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.smtp.errorSuperAdmin";
  }
  if (error.status === 400 || error.code === "INVALID_SMTP_CONFIGURATION") {
    return "install.smtp.errorInvalid";
  }
  return "install.smtp.errorGeneric";
}
