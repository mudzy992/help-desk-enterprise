import { mapDomainApiError } from "@/lib/map-domain-api-error";

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
  return mapDomainApiError<ServiceFormsErrorKey>(error, {
    fallback: "services.forms.errorGeneric",
    codes: codeKeys,
    statuses: {
      401: "services.forms.errorUnauthorized",
      403: "services.forms.errorForbidden",
      404: "services.forms.errorNotFound",
      409: "services.forms.errorAlreadyExists",
      400: "services.forms.errorSchema",
      422: "services.forms.errorSchema",
    },
  });
}
