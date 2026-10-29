import { mapDomainApiError } from "@/lib/map-domain-api-error";

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

export function mapServiceOnboardingError(error: unknown): ServiceOnboardingErrorKey {
  return mapDomainApiError<ServiceOnboardingErrorKey>(error, {
    fallback: "services.onboarding.errorGeneric",
    codes: codeKeys,
    statuses: {
      401: "services.onboarding.errorUnauthorized",
      403: "services.onboarding.errorForbidden",
      404: "services.onboarding.errorNotFound",
      409: "services.onboarding.errorAlreadyExists",
      503: "services.onboarding.errorUnavailable",
      400: "services.onboarding.errorPrerequisites",
      422: "services.onboarding.errorPrerequisites",
    },
  });
}
