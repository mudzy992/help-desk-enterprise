import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ServiceFormsError } from './service-forms.error';
import type { ServiceFormsErrorCode } from './service-forms.error';

const notFoundCodes: readonly ServiceFormsErrorCode[] = [
  'FORM_NOT_FOUND',
  'FORM_VERSION_NOT_FOUND',
  'TICKET_NOT_FOUND',
];

const conflictCodes: readonly ServiceFormsErrorCode[] = [
  'FORM_ALREADY_EXISTS',
  'FORM_VERSION_IMMUTABLE',
];

const messages: Record<ServiceFormsErrorCode, string> = {
  FORMS_DISABLED: 'Service forms are disabled',
  FORMS_UNAVAILABLE: 'Service forms configuration is unavailable',
  FORM_ALREADY_EXISTS: 'This service already has a form',
  FORM_NOT_FOUND: 'Service form was not found',
  FORM_VERSION_NOT_FOUND: 'Form version was not found',
  INVALID_FORM_SCHEMA: 'Form schema is invalid',
  DUPLICATE_FIELD_IDENTIFIER: 'Form field identifiers must be unique',
  INVALID_FIELD_IDENTIFIER: 'Form field identifier is invalid',
  INVALID_FIELD_CONFIGURATION: 'Form field configuration is invalid',
  FORM_VERSION_IMMUTABLE: 'This form version cannot be mutated',
  FORM_VERSIONING_DISABLED: 'Form versioning is disabled',
  NO_ACTIVE_FORM_VERSION: 'No active form version exists for this service',
  FORM_VERSION_NOT_DRAFT: 'Only draft form versions can be activated',
  TICKET_FORM_VERSION_REQUIRED: 'Ticket formVersionRef is required',
  TICKET_NOT_FOUND: 'Ticket was not found',
  FORM_VERSION_SERVICE_MISMATCH: 'Form version does not belong to this service',
};

export function mapServiceFormsError(error: unknown): HttpException {
  if (!(error instanceof ServiceFormsError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  if (conflictCodes.includes(error.code)) {
    return new ConflictException(body);
  }
  if (error.code === 'FORMS_UNAVAILABLE') {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
