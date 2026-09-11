import { ApiError } from "@/services/api";

export type InstallCompleteErrorKey =
  | "install.complete.errorSuperAdmin"
  | "install.complete.errorGeneric";

export function mapInstallCompleteError(
  error: unknown,
): InstallCompleteErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.complete.errorGeneric";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.complete.errorSuperAdmin";
  }
  return "install.complete.errorGeneric";
}
