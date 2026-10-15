import { ApiError } from "@/services/api";

export type InstallCompleteErrorKey =
  | "install.complete.errorSuperAdmin"
  | "install.complete.notReady"
  | "install.complete.errorGeneric";

export function mapInstallCompleteError(error: unknown): InstallCompleteErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.complete.errorGeneric";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.complete.errorSuperAdmin";
  }
  // F0.7: the server refuses to finish an installation that cannot receive
  // tickets (`INSTALL_NOT_READY`); the missing checks are listed next to it.
  if (error.code === "INSTALL_NOT_READY") {
    return "install.complete.notReady";
  }
  return "install.complete.errorGeneric";
}

/**
 * The readiness keys behind `INSTALL_NOT_READY` (`details.missing`). Reading it
 * here keeps the step markup free of response-shape handling.
 */
export function readInstallCompleteMissingKeys(error: unknown): readonly string[] {
  if (!(error instanceof ApiError) || error.code !== "INSTALL_NOT_READY") {
    return [];
  }
  const missing = error.details?.missing;
  if (!Array.isArray(missing)) {
    return [];
  }
  return missing.filter((entry): entry is string => typeof entry === "string");
}
