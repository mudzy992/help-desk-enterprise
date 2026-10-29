import { ApiError } from "@/services/api";

export type InstallSeedErrorKey =
  "install.seed.errorSuperAdmin" | "install.structure.errorInvalid" | "install.seed.errorGeneric";

export function mapInstallSeedError(error: unknown): InstallSeedErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.seed.errorGeneric";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.seed.errorSuperAdmin";
  }
  // F2: a name that cannot become a key or a distinguished name.
  if (error.code === "INSTALL_SEED_STRUCTURE_INVALID" || error.status === 400) {
    return "install.structure.errorInvalid";
  }
  return "install.seed.errorGeneric";
}
