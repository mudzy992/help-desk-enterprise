import { mapDomainApiError } from "@/lib/map-domain-api-error";

export type ServiceCategoryErrorKey =
  | "services.categories.errorUnauthorized"
  | "services.categories.errorForbidden"
  | "services.categories.errorReadOnly"
  | "services.categories.errorNotFound"
  | "services.categories.errorDuplicateSlug"
  | "services.categories.errorValidation"
  | "services.categories.errorStaleWrite"
  | "services.categories.errorInvalidParent"
  | "services.categories.errorSelfParent"
  | "services.categories.errorCircular"
  | "services.categories.errorHasChildren"
  | "services.categories.errorHasServices"
  | "services.categories.errorGeneric";

const codeKeys: Partial<Record<string, ServiceCategoryErrorKey>> = {
  INVALID_CREDENTIALS: "services.categories.errorUnauthorized",
  FORBIDDEN: "services.categories.errorForbidden",
  READ_ONLY_MODE: "services.categories.errorReadOnly",
  CATEGORY_NOT_FOUND: "services.categories.errorNotFound",
  NOT_FOUND: "services.categories.errorNotFound",
  DUPLICATE_SLUG: "services.categories.errorDuplicateSlug",
  INVALID_NAME: "services.categories.errorValidation",
  INVALID_SLUG: "services.categories.errorValidation",
  INVALID_PARENT_CATEGORY: "services.categories.errorInvalidParent",
  SELF_PARENT_CATEGORY: "services.categories.errorSelfParent",
  CIRCULAR_CATEGORY: "services.categories.errorCircular",
  CATEGORY_HAS_CHILDREN: "services.categories.errorHasChildren",
  CATEGORY_HAS_SERVICES: "services.categories.errorHasServices",
  OPTIMISTIC_PRECONDITION_REQUIRED: "services.categories.errorValidation",
  OPTIMISTIC_IF_MATCH_INVALID: "services.categories.errorValidation",
  OPTIMISTIC_STALE_WRITE: "services.categories.errorStaleWrite",
};

export function mapServiceCategoryError(error: unknown): ServiceCategoryErrorKey {
  return mapDomainApiError<ServiceCategoryErrorKey>(error, {
    fallback: "services.categories.errorGeneric",
    codes: codeKeys,
    statuses: {
      401: "services.categories.errorUnauthorized",
      403: "services.categories.errorForbidden",
      404: "services.categories.errorNotFound",
      409: "services.categories.errorDuplicateSlug",
      412: "services.categories.errorStaleWrite",
      428: "services.categories.errorValidation",
      400: "services.categories.errorValidation",
      422: "services.categories.errorValidation",
    },
  });
}
