import { ApiError } from "@/services/api";

export type InstallSeedErrorKey =
  | "install.seed.errorSuperAdmin"
  | "install.seed.errorGeneric";

export function mapInstallSeedError(error: unknown): InstallSeedErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.seed.errorGeneric";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.seed.errorSuperAdmin";
  }
  return "install.seed.errorGeneric";
}
