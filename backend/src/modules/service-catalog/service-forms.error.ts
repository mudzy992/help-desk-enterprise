export type ServiceFormsErrorCode =
  | 'FORMS_DISABLED'
  | 'FORMS_UNAVAILABLE'
  | 'FORM_ALREADY_EXISTS'
  | 'FORM_NOT_FOUND'
  | 'FORM_VERSION_NOT_FOUND'
  | 'INVALID_FORM_SCHEMA'
  | 'DUPLICATE_FIELD_IDENTIFIER'
  | 'INVALID_FIELD_IDENTIFIER'
  | 'INVALID_FIELD_CONFIGURATION'
  | 'FORM_VERSION_IMMUTABLE'
  | 'FORM_VERSIONING_DISABLED'
  | 'NO_ACTIVE_FORM_VERSION'
  | 'FORM_VERSION_NOT_DRAFT'
  | 'TICKET_FORM_VERSION_REQUIRED'
  | 'TICKET_NOT_FOUND'
  | 'FORM_VERSION_SERVICE_MISMATCH';

export class ServiceFormsError extends Error {
  constructor(
    readonly code: ServiceFormsErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'ServiceFormsError';
  }
}
