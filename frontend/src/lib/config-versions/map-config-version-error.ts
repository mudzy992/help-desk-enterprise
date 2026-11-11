import { ApiError } from "@/services/api";

export type ConfigVersionErrorKey =
  | "configVersions.errorUnauthorized"
  | "configVersions.errorForbidden"
  | "configVersions.errorDisabled"
  | "configVersions.errorShadowDisabled"
  | "configVersions.errorReason"
  | "configVersions.errorNotFound"
  | "configVersions.errorAlreadyActive"
  | "configVersions.errorNoPrevious"
  | "configVersions.errorValidation"
  | "configVersions.errorPackageInvalid"
  | "configVersions.errorPackageTooLarge"
  | "configVersions.errorPackageChecksum"
  | "configVersions.errorPackageSignature"
  | "configVersions.errorPackageUnsigned"
  | "configVersions.errorPackageUnresolved"
  | "configVersions.errorPackageSource"
  | "configVersions.errorGeneric";

const packageErrorKeys: Readonly<Record<string, ConfigVersionErrorKey>> = {
  CONFIG_PACKAGE_INVALID: "configVersions.errorPackageInvalid",
  CONFIG_PACKAGE_CHECKSUM_MISMATCH: "configVersions.errorPackageChecksum",
  CONFIG_PACKAGE_SIGNATURE_INVALID: "configVersions.errorPackageSignature",
  CONFIG_PACKAGE_UNSIGNED_NOT_CONFIRMED: "configVersions.errorPackageUnsigned",
  CONFIG_PACKAGE_UNRESOLVED_REFERENCES: "configVersions.errorPackageUnresolved",
  CONFIG_PACKAGE_SOURCE_INCONSISTENT: "configVersions.errorPackageSource",
};

export function mapConfigVersionError(error: unknown): ConfigVersionErrorKey {
  if (!(error instanceof ApiError)) {
    return "configVersions.errorGeneric";
  }
  if (error.status === 401) {
    return "configVersions.errorUnauthorized";
  }
  const packageKey = packageErrorKeys[error.code];
  if (packageKey !== undefined) {
    return packageKey;
  }
  if (error.status === 413) {
    return "configVersions.errorPackageTooLarge";
  }
  if (error.code === "SHADOW_MODE_DISABLED") {
    return "configVersions.errorShadowDisabled";
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
