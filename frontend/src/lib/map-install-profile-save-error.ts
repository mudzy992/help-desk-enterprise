import { ApiError } from "@/services/api";

export type InstallProfileSaveErrorKey =
  | "install.profile.errorLocked"
  | "install.profile.errorSuperAdmin"
  | "install.profile.errorGeneric";

/*
  Install wizard v2 (F3): the package may be changed while the operator is on the
  step, but once the initial data exists only an upgrade is accepted (owner
  decision 5, F1). The server owns that rule; the UI only names it.
*/

export function mapInstallProfileSaveError(error: unknown): InstallProfileSaveErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.profile.errorGeneric";
  }
  if (error.code === "INSTALL_PROFILE_LOCKED_AFTER_SEED") {
    return "install.profile.errorLocked";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.profile.errorSuperAdmin";
  }
  return "install.profile.errorGeneric";
}
