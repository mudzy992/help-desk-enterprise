import { ApiError } from "@/services/api";

export type TeamsErrorKey =
  | "teamsAdmin.errors.appIdRequired"
  | "teamsAdmin.errors.publicUrlRequired"
  | "teamsAdmin.errors.simulatorOff"
  | "teamsAdmin.errors.forbidden"
  | "teamsAdmin.errors.generic";

/** Paket 3.1: Teams admin API errors → one translated sentence. */
export function mapTeamsError(error: unknown): TeamsErrorKey {
  if (!(error instanceof ApiError)) return "teamsAdmin.errors.generic";
  if (error.code === "TEAMS_APP_ID_REQUIRED") return "teamsAdmin.errors.appIdRequired";
  if (error.code === "TEAMS_PUBLIC_URL_REQUIRED") return "teamsAdmin.errors.publicUrlRequired";
  if (error.code === "TEAMS_SIMULATOR_OFF") return "teamsAdmin.errors.simulatorOff";
  if (error.status === 403) return "teamsAdmin.errors.forbidden";
  return "teamsAdmin.errors.generic";
}
