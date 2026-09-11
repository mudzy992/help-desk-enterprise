import { ApiError } from "@/services/api";

export type InstallAddonsErrorKey =
  | "install.addons.errorInvalid"
  | "install.addons.errorUnsupported"
  | "install.addons.errorSuperAdmin"
  | "install.addons.errorGeneric";

export function mapInstallAddonsSaveError(
  error: unknown,
): InstallAddonsErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.addons.errorGeneric";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.addons.errorSuperAdmin";
  }
  if (error.code === "UNSUPPORTED_ADDON_KEY") {
    return "install.addons.errorUnsupported";
  }
  if (error.status === 400 || error.code === "INVALID_ADDON_CONFIGURATION") {
    return "install.addons.errorInvalid";
  }
  return "install.addons.errorGeneric";
}
