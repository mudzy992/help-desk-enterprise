import { ApiError } from "@/services/api";

export type ServiceCategoryErrorKey =
  | "services.categories.errorUnauthorized"
  | "services.categories.errorForbidden"
  | "services.categories.errorReadOnly"
  | "services.categories.errorNotFound"
  | "services.categories.errorDuplicateSlug"
  | "services.categories.errorValidation"
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
};

export function mapServiceCategoryError(error: unknown): ServiceCategoryErrorKey {
  if (!(error instanceof ApiError)) {
    return "services.categories.errorGeneric";
  }
  const byCode = codeKeys[error.code];
  if (byCode !== undefined) {
    return byCode;
  }
  if (error.status === 401) {
    return "services.categories.errorUnauthorized";
  }
  if (error.status === 403) {
    return "services.categories.errorForbidden";
  }
  if (error.status === 404) {
    return "services.categories.errorNotFound";
  }
  if (error.status === 409) {
    return "services.categories.errorDuplicateSlug";
  }
  if (error.status === 400 || error.status === 422) {
    return "services.categories.errorValidation";
  }
  return "services.categories.errorGeneric";
}
