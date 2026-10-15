import { ApiError } from "@/services/api";

export type InstallSuperAdminCreateErrorKey =
  "install.errorInvalid" | "install.errorDuplicate" | "install.errorGeneric";

/** The founder account is the first thing the server validates in the wizard. */
export function mapInstallSuperAdminCreateError(error: unknown): InstallSuperAdminCreateErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.errorGeneric";
  }
  if (
    error.status === 400 ||
    error.code === "INVALID_SUPER_ADMIN_CREDENTIALS" ||
    error.code === "PASSWORD_POLICY_VIOLATIONS"
  ) {
    return "install.errorInvalid";
  }
  if (error.code === "SUPER_ADMIN_ALREADY_EXISTS" || error.code === "SUPER_ADMIN_EMAIL_TAKEN") {
    return "install.errorDuplicate";
  }
  return "install.errorGeneric";
}
