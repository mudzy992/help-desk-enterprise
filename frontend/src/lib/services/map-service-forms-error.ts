import { ApiError } from "@/services/api";

export type ServiceFormsErrorKey =
  | "services.forms.errorUnauthorized"
  | "services.forms.errorForbidden"
  | "services.forms.errorDisabled"
  | "services.forms.errorNotFound"
  | "services.forms.errorAlreadyExists"
  | "services.forms.errorSchema"
  | "services.forms.errorDuplicateField"
  | "services.forms.errorFieldId"
  | "services.forms.errorFieldConfig"
  | "services.forms.errorImmutable"
  | "services.forms.errorVersioningDisabled"
  | "services.forms.errorNotDraft"
  | "services.forms.errorNoActive"
  | "services.forms.errorGeneric";

const codeKeys: Partial<Record<string, ServiceFormsErrorKey>> = {
  INVALID_CREDENTIALS: "services.forms.errorUnauthorized",
  FORBIDDEN: "services.forms.errorForbidden",
  FORMS_DISABLED: "services.forms.errorDisabled",
  FORM_NOT_FOUND: "services.forms.errorNotFound",
  FORM_VERSION_NOT_FOUND: "services.forms.errorNotFound",
  FORM_ALREADY_EXISTS: "services.forms.errorAlreadyExists",
  INVALID_FORM_SCHEMA: "services.forms.errorSchema",
  DUPLICATE_FIELD_IDENTIFIER: "services.forms.errorDuplicateField",
  INVALID_FIELD_IDENTIFIER: "services.forms.errorFieldId",
  INVALID_FIELD_CONFIGURATION: "services.forms.errorFieldConfig",
  FORM_VERSION_IMMUTABLE: "services.forms.errorImmutable",
  FORM_VERSIONING_DISABLED: "services.forms.errorVersioningDisabled",
  FORM_VERSION_NOT_DRAFT: "services.forms.errorNotDraft",
  NO_ACTIVE_FORM_VERSION: "services.forms.errorNoActive",
  FORM_VERSION_SERVICE_MISMATCH: "services.forms.errorNotFound",
  FORMS_UNAVAILABLE: "services.forms.errorGeneric",
};

export function mapServiceFormsError(error: unknown): ServiceFormsErrorKey {
  if (!(error instanceof ApiError)) {
    return "services.forms.errorGeneric";
  }
  const byCode = codeKeys[error.code];
  if (byCode !== undefined) {
    return byCode;
  }
  if (error.status === 401) {
    return "services.forms.errorUnauthorized";
  }
  if (error.status === 403) {
    return "services.forms.errorForbidden";
  }
  if (error.status === 404) {
    return "services.forms.errorNotFound";
  }
  if (error.status === 409) {
    return "services.forms.errorAlreadyExists";
  }
  if (error.status === 400 || error.status === 422) {
    return "services.forms.errorSchema";
  }
  return "services.forms.errorGeneric";
}
