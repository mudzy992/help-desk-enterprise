import {
  BadRequestException,
  ConflictException,
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
  'PARTICIPANT_NOT_FOUND',
  'PARTICIPANT_USER_NOT_FOUND',
  'PARTICIPANT_GROUP_NOT_FOUND',
  'TIME_LOG_NOT_FOUND',
  'ATTACHMENT_NOT_FOUND',
];

const forbiddenCodes: readonly TicketsErrorCode[] = [
  'FORBIDDEN',
  'STATUS_CHANGE_FORBIDDEN',
  'GROUP_INBOX_DISABLED',
  'PARTICIPANTS_DISABLED',
  'CHAT_MESSAGE_TYPES_DISABLED',
  'MESSAGE_TYPE_NOT_ALLOWED',
  'PARTICIPANT_LOCKED',
  'ATTACHMENTS_DISABLED',
];

const unavailableCodes: readonly TicketsErrorCode[] = [
  'ROUTING_UNAVAILABLE',
  'ASSIGNMENT_UNAVAILABLE',
  'ATTACHMENTS_STORAGE_UNAVAILABLE',
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
  PARTICIPANTS_DISABLED: 'Ticket participants are disabled',
  PARTICIPANT_NOT_FOUND: 'Ticket participant was not found',
  PARTICIPANT_DUPLICATE: 'Ticket participant already exists',
  INVALID_PARTICIPANT_ROLE: 'Ticket participant role is invalid',
  PARTICIPANT_IDENTITY_REQUIRED: 'Ticket participant needs a user or group',
  PARTICIPANT_USER_NOT_FOUND: 'Participant user was not found',
  PARTICIPANT_GROUP_NOT_FOUND: 'Participant group was not found',
  PARTICIPANT_LOCKED: 'This ticket participant cannot be changed',
  CHAT_MESSAGE_TYPES_DISABLED: 'Ticket chat message types are disabled',
  INVALID_MESSAGE_TYPE: 'Ticket message type is invalid',
  INVALID_MESSAGE_BODY: 'Ticket message body is invalid',
  MESSAGE_TYPE_NOT_ALLOWED: 'You cannot create this ticket message type',
  TIME_LOG_NOT_FOUND: 'Ticket time log was not found',
  OVERLAPPING_TIMER: 'An active timer already exists for this user and ticket',
  TIME_LOG_NOT_ACTIVE: 'Ticket time log is not active',
  TIME_LOG_IMMUTABLE: 'Completed time entries cannot be changed',
  ATTACHMENTS_DISABLED: 'Ticket attachments are disabled',
  ATTACHMENT_NOT_FOUND: 'Ticket attachment was not found',
  ATTACHMENT_REQUIRED: 'An attachment file is required',
  ATTACHMENT_TOO_LARGE: 'Attachment exceeds the maximum allowed size',
  ATTACHMENT_TYPE_NOT_ALLOWED: 'Attachment type is not allowed',
  ATTACHMENT_FILENAME_INVALID: 'Attachment filename is invalid',
  ATTACHMENT_LIMIT_REACHED: 'Ticket attachment limit was reached',
  CLASSIFICATION_DOWNGRADE:
    'Attachment classification cannot be lower than the ticket',
  ATTACHMENTS_STORAGE_UNAVAILABLE: 'Attachment storage is unavailable',
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
  if (unavailableCodes.includes(error.code)) {
    return new ServiceUnavailableException(body);
  }
  if (error.code === 'OVERLAPPING_TIMER') {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
