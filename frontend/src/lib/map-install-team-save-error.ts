import { ApiError } from "@/services/api";

export type InstallTeamErrorKey =
  | "install.team.errorInvalid"
  | "install.team.errorEmailTaken"
  | "install.team.errorStructure"
  | "install.team.errorSuperAdmin"
  | "install.team.errorGeneric";

/**
 * F2: the team step answers 400 for a row the domain refused and 409 for an
 * address that is already taken or a group that does not exist yet.
 */
export function mapInstallTeamSaveError(error: unknown): InstallTeamErrorKey {
  if (!(error instanceof ApiError)) {
    return "install.team.errorGeneric";
  }
  if (error.code === "SUPER_ADMIN_REQUIRED") {
    return "install.team.errorSuperAdmin";
  }
  if (error.code === "INSTALL_TEAM_EMAIL_CONFLICT") {
    return "install.team.errorEmailTaken";
  }
  if (error.code === "INSTALL_TEAM_STRUCTURE_REQUIRED") {
    return "install.team.errorStructure";
  }
  if (error.status === 400 || error.code === "INSTALL_TEAM_INVALID") {
    return "install.team.errorInvalid";
  }
  return "install.team.errorGeneric";
}
