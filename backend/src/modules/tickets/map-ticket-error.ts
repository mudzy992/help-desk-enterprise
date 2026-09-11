import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TicketsError } from './tickets.error';
import type { TicketsErrorCode } from './tickets.error';

const notFoundCodes: readonly TicketsErrorCode[] = [
  'NOT_FOUND',
  'ORIGIN_UNIT_NOT_FOUND',
  'SERVICE_NOT_FOUND',
  'FORM_VERSION_NOT_FOUND',
  'REQUESTER_NOT_FOUND',
];

const forbiddenCodes: readonly TicketsErrorCode[] = [
  'FORBIDDEN',
  'STATUS_CHANGE_FORBIDDEN',
  'GROUP_INBOX_DISABLED',
];

const messages: Record<TicketsErrorCode, string> = {
  NOT_FOUND: 'Ticket was not found',
  ORIGIN_UNIT_NOT_FOUND: 'Origin organizational unit was not found',
  ORIGIN_UNIT_REQUIRED: 'Origin organizational unit is required',
  SERVICE_NOT_FOUND: 'Service was not found',
  SERVICE_REQUIRED: 'Service is required',
  SERVICE_NOT_OFFERED: 'Service is not offered for new tickets',
  FORM_VERSION_REQUIRED: 'Ticket formVersionRef is required',
  FORM_VERSION_NOT_FOUND: 'Form version was not found',
  FORM_VERSION_SERVICE_MISMATCH: 'Form version does not belong to this service',
  FORM_VERSION_NOT_ACTIVE: 'New tickets must use an ACTIVE form version',
  INVALID_STATUS_TRANSITION: 'Ticket status transition is not allowed',
  STATUS_CHANGE_FORBIDDEN: 'You cannot change ticket status',
  FORBIDDEN: 'Authorization failed',
  INVALID_TITLE: 'Title is invalid',
  INVALID_DESCRIPTION: 'Description is invalid',
  REQUESTER_NOT_FOUND: 'Requester was not found',
  ROUTING_UNAVAILABLE: 'Ticket routing is unavailable',
  ASSIGNMENT_UNAVAILABLE: 'Ticket assignment is unavailable',
  GROUP_INBOX_DISABLED: 'Group inbox is disabled',
  TICKET_NOT_CLAIMABLE: 'Ticket cannot be claimed',
};

export function mapTicketError(error: unknown): HttpException {
  if (!(error instanceof TicketsError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  if (forbiddenCodes.includes(error.code)) {
    return new ForbiddenException(body);
  }
  if (
    error.code === 'ROUTING_UNAVAILABLE' ||
    error.code === 'ASSIGNMENT_UNAVAILABLE'
  ) {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
