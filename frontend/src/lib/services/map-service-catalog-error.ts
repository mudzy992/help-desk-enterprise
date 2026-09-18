import { ApiError } from "@/services/api";

export type ServiceCatalogErrorKey =
  | "services.errorUnauthorized"
  | "services.errorForbidden"
  | "services.errorReadOnly"
  | "services.errorDuplicateSlug"
  | "services.errorLifecycle"
  | "services.errorNotDeletable"
  | "services.errorHasDependencies"
  | "services.errorCategory"
  | "services.errorValidation"
  | "services.errorUnavailable"
  | "services.errorDowntimeOverlap"
  | "services.errorDowntimeRange"
  | "services.errorDowntimeDisabled"
  | "services.errorDowntimeNotFound"
  | "services.errorGeneric";

const codeKeys: Partial<Record<string, ServiceCatalogErrorKey>> = {
  INVALID_CREDENTIALS: "services.errorUnauthorized",
  FORBIDDEN: "services.errorForbidden",
  READ_ONLY_MODE: "services.errorReadOnly",
  DUPLICATE_SLUG: "services.errorDuplicateSlug",
  INVALID_LIFECYCLE_TRANSITION: "services.errorLifecycle",
  INVALID_LIFECYCLE_STATE: "services.errorLifecycle",
  LIFECYCLE_DISABLED: "services.errorLifecycle",
  LIFECYCLE_UNAVAILABLE: "services.errorUnavailable",
  NOT_DELETABLE: "services.errorNotDeletable",
  HAS_DEPENDENCIES: "services.errorHasDependencies",
  CATEGORY_NOT_FOUND: "services.errorCategory",
  INVALID_NAME: "services.errorValidation",
  INVALID_SLUG: "services.errorValidation",
  SLUG_IMMUTABLE: "services.errorValidation",
  OVERLAPPING_DOWNTIME_WINDOW: "services.errorDowntimeOverlap",
  INVALID_DOWNTIME_RANGE: "services.errorDowntimeRange",
  INVALID_DOWNTIME_MESSAGE: "services.errorValidation",
  DOWNTIME_DISABLED: "services.errorDowntimeDisabled",
  DOWNTIME_UNAVAILABLE: "services.errorUnavailable",
  DOWNTIME_NOT_FOUND: "services.errorDowntimeNotFound",
  REASON_REQUIRED: "services.errorValidation",
};

export function mapServiceCatalogError(error: unknown): ServiceCatalogErrorKey {
  if (!(error instanceof ApiError)) {
    return "services.errorGeneric";
  }
  const byCode = codeKeys[error.code];
  if (byCode !== undefined) {
    return byCode;
  }
  if (error.status === 401) {
    return "services.errorUnauthorized";
  }
  if (error.status === 403) {
    return "services.errorForbidden";
  }
  if (error.status === 409) {
    return "services.errorDuplicateSlug";
  }
  if (error.status === 400 || error.status === 422) {
    return "services.errorValidation";
  }
  return "services.errorGeneric";
}
