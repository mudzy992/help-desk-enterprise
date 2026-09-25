import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { mapTicketError } from '../tickets/map-ticket-error';
import { TemplatesError, type TemplatesErrorCode } from './templates.error';

const messages: Record<TemplatesErrorCode, string> = {
  TEMPLATES_DISABLED: 'Response templates are disabled',
  PLAYBOOKS_DISABLED: 'Playbooks are disabled',
  FORBIDDEN: 'Authorization failed',
  TEMPLATE_NOT_FOUND: 'Response template was not found',
  PLAYBOOK_NOT_FOUND: 'Playbook was not found',
  TEMPLATE_NAME_INVALID: 'The template name must have 2 to 120 characters',
  TEMPLATE_NAME_TAKEN: 'A template with this name already exists',
  TEMPLATE_BODY_INVALID: 'The template text is empty or too long',
  TEMPLATE_UNKNOWN_VARIABLE: 'The template uses a variable that does not exist',
  TEMPLATE_KIND_MISMATCH: 'The template cannot be used in this composer mode',
  TEMPLATE_SCOPE_INVALID: 'A service, category or group in the scope does not exist',
  TEMPLATE_SCOPE_FORBIDDEN: 'The scope is outside the services you may manage',
  TEMPLATE_TAGS_INVALID: 'At most 10 tags of up to 40 characters are allowed',
  REASON_REQUIRED: 'A reason of 3 to 500 characters is required',
  PLAYBOOK_NAME_INVALID: 'The playbook name must have 2 to 120 characters',
  PLAYBOOK_NAME_TAKEN: 'A playbook with this name already exists',
  PLAYBOOK_STEPS_INVALID: 'A playbook needs 1 to 50 steps with a title',
  PLAYBOOK_REFERENCE_INVALID: 'A linked article or template does not exist',
  TICKET_PLAYBOOK_NOT_FOUND: 'The ticket has no playbook',
  TICKET_PLAYBOOK_ALREADY_ATTACHED: 'The ticket already has a playbook',
  TICKET_PLAYBOOK_NOT_APPLICABLE: 'The playbook is inactive or does not apply to this ticket',
  TICKET_PLAYBOOK_UP_TO_DATE: 'The ticket already uses the newest playbook version',
  TICKET_PLAYBOOK_STEP_NOT_FOUND: 'The step is not part of this checklist',
  TICKET_PLAYBOOK_READ_ONLY: 'The checklist of a closed, archived or merged ticket cannot change',
};

const notFound: readonly TemplatesErrorCode[] = [
  'TEMPLATE_NOT_FOUND',
  'PLAYBOOK_NOT_FOUND',
  'TICKET_PLAYBOOK_NOT_FOUND',
  'TICKET_PLAYBOOK_STEP_NOT_FOUND',
];
const forbidden: readonly TemplatesErrorCode[] = [
  'FORBIDDEN',
  'TEMPLATE_SCOPE_FORBIDDEN',
  'TEMPLATES_DISABLED',
  'PLAYBOOKS_DISABLED',
];
const conflict: readonly TemplatesErrorCode[] = [
  'TEMPLATE_NAME_TAKEN',
  'PLAYBOOK_NAME_TAKEN',
  'TICKET_PLAYBOOK_ALREADY_ATTACHED',
  'TICKET_PLAYBOOK_UP_TO_DATE',
  'TICKET_PLAYBOOK_READ_ONLY',
];

export function mapTemplatesError(error: unknown): unknown {
  if (!(error instanceof TemplatesError)) {
    return error instanceof HttpException ? error : mapTicketError(error);
  }
  const body = {
    code: error.code,
    message: messages[error.code],
    ...(error.details === undefined ? {} : { details: error.details }),
  };
  if (notFound.includes(error.code)) return new NotFoundException(body);
  if (forbidden.includes(error.code)) return new ForbiddenException(body);
  if (conflict.includes(error.code)) return new ConflictException(body);
  return new BadRequestException(body);
}

export async function executeTemplatesOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapTemplatesError(error);
  }
}
