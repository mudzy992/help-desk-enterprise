import { ApiError } from "@/services/api";

export type InstallIdentityErrorKey =
  | "install.identity.errorInvalid"
  | "install.identity.errorLocale"
  | "install.identity.errorTimeZone"
  | "install.identity.errorSuperAdmin"
  | "install.identity.errorGeneric";

/** F2: the server names the reason, so the form can point at the right field. */
export function mapInstallIdentitySaveError(error: unknown): InstallIdentityErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.identity.errorGeneric";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.identity.errorSuperAdmin";
  }
  if (error.code === "INSTALL_IDENTITY_LOCALE_UNSUPPORTED") {
    return "install.identity.errorLocale";
  }
  if (error.code === "INSTALL_IDENTITY_TIME_ZONE_UNKNOWN") {
    return "install.identity.errorTimeZone";
  }
  if (error.status === 400) {
    return "install.identity.errorInvalid";
  }
  return "install.identity.errorGeneric";
}
