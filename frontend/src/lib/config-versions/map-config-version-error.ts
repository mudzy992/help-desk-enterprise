import { ApiError } from "@/services/api";

export type ConfigVersionErrorKey =
  | "configVersions.errorUnauthorized"
  | "configVersions.errorForbidden"
  | "configVersions.errorDisabled"
  | "configVersions.errorReason"
  | "configVersions.errorNotFound"
  | "configVersions.errorAlreadyActive"
  | "configVersions.errorNoPrevious"
  | "configVersions.errorValidation"
  | "configVersions.errorGeneric";

export function mapConfigVersionError(error: unknown): ConfigVersionErrorKey {
  if (!(error instanceof ApiError)) {
    return "configVersions.errorGeneric";
  }
  if (error.status === 401) {
    return "configVersions.errorUnauthorized";
  }
  if (error.code === "ROLLBACK_DISABLED" || error.status === 403) {
    return "configVersions.errorForbidden";
  }
  if (error.code === "CONFIG_VERSIONING_DISABLED" || error.status === 503) {
    return "configVersions.errorDisabled";
  }
  if (error.code === "REASON_REQUIRED") {
    return "configVersions.errorReason";
  }
  if (error.code === "CONFIG_VERSION_ALREADY_ACTIVE") {
    return "configVersions.errorAlreadyActive";
  }
  if (error.code === "NO_PREVIOUS_CONFIG_VERSION") {
    return "configVersions.errorNoPrevious";
  }
  if (error.code === "CONFIG_VALIDATION_FAILED") {
    return "configVersions.errorValidation";
  }
  if (
    error.code === "CONFIG_VERSION_NOT_FOUND" ||
    error.code === "CONFIG_VERSION_AGAINST_NOT_FOUND" ||
    error.status === 404
  ) {
    return "configVersions.errorNotFound";
  }
  return "configVersions.errorGeneric";
}
