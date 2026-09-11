import { ApiError } from "@/services/api";

export type InstallLoginProviderErrorKey =
  | "install.loginProvider.errorIncomplete"
  | "install.loginProvider.errorInvalid"
  | "install.loginProvider.errorSuperAdmin"
  | "install.loginProvider.errorGeneric";

export function mapInstallLoginProviderSaveError(
  error: unknown,
): InstallLoginProviderErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.loginProvider.errorGeneric";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.loginProvider.errorSuperAdmin";
  }
  if (
    error.status === 400 ||
    error.code === "INVALID_LOGIN_PROVIDER_CONFIGURATION"
  ) {
    return "install.loginProvider.errorInvalid";
  }
  return "install.loginProvider.errorGeneric";
}
