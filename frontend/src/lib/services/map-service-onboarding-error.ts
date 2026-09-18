import { ApiError } from "@/services/api";

export type ServiceOnboardingErrorKey =
  | "services.onboarding.errorUnauthorized"
  | "services.onboarding.errorForbidden"
  | "services.onboarding.errorDisabled"
  | "services.onboarding.errorNotFound"
  | "services.onboarding.errorAlreadyExists"
  | "services.onboarding.errorStatus"
  | "services.onboarding.errorStep"
  | "services.onboarding.errorPrerequisites"
  | "services.onboarding.errorFormRef"
  | "services.onboarding.errorRoutingRef"
  | "services.onboarding.errorSlaRef"
  | "services.onboarding.errorApprovalsRef"
  | "services.onboarding.errorFinalize"
  | "services.onboarding.errorRoutingCoverage"
  | "services.onboarding.errorNotDraft"
  | "services.onboarding.errorNotResumable"
  | "services.onboarding.errorUnavailable"
  | "services.onboarding.errorGeneric";

const codeKeys: Partial<Record<string, ServiceOnboardingErrorKey>> = {
  INVALID_CREDENTIALS: "services.onboarding.errorUnauthorized",
  FORBIDDEN: "services.onboarding.errorForbidden",
  DISABLED: "services.onboarding.errorDisabled",
  NOT_FOUND: "services.onboarding.errorNotFound",
  ALREADY_EXISTS: "services.onboarding.errorAlreadyExists",
  INVALID_STATUS_TRANSITION: "services.onboarding.errorStatus",
  INVALID_STEP_TRANSITION: "services.onboarding.errorStep",
  STEP_PREREQUISITES_NOT_MET: "services.onboarding.errorPrerequisites",
  INVALID_FORM_VERSION_REF: "services.onboarding.errorFormRef",
  INVALID_ROUTING_CONFIGURATION_REF: "services.onboarding.errorRoutingRef",
  INVALID_SLA_CONFIGURATION_REF: "services.onboarding.errorSlaRef",
  INVALID_APPROVALS_CONFIGURATION_REF: "services.onboarding.errorApprovalsRef",
  FINAL_VALIDATION_FAILED: "services.onboarding.errorFinalize",
  ROUTING_COVERAGE_MISSING: "services.onboarding.errorRoutingCoverage",
  INCONSISTENT_ONBOARDING_STATE: "services.onboarding.errorStatus",
  SERVICE_NOT_DRAFT: "services.onboarding.errorNotDraft",
  ONBOARDING_NOT_RESUMABLE: "services.onboarding.errorNotResumable",
  UNAVAILABLE: "services.onboarding.errorUnavailable",
};

export function mapServiceOnboardingError(
  error: unknown,
): ServiceOnboardingErrorKey {
  if (!(error instanceof ApiError)) {
    return "services.onboarding.errorGeneric";
  }
  const byCode = codeKeys[error.code];
  if (byCode !== undefined) {
    return byCode;
  }
  if (error.status === 401) {
    return "services.onboarding.errorUnauthorized";
  }
  if (error.status === 403) {
    return "services.onboarding.errorForbidden";
  }
  if (error.status === 404) {
    return "services.onboarding.errorNotFound";
  }
  if (error.status === 409) {
    return "services.onboarding.errorAlreadyExists";
  }
  if (error.status === 503) {
    return "services.onboarding.errorUnavailable";
  }
  if (error.status === 400 || error.status === 422) {
    return "services.onboarding.errorPrerequisites";
  }
  return "services.onboarding.errorGeneric";
}
