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
import { ticketErrorMessages } from './ticket-error-messages';

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
  'APPROVAL_NOT_FOUND',
  'HANDLER_GROUP_NOT_FOUND',
  'SAVED_VIEW_NOT_FOUND',
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
  'APPROVALS_DISABLED',
  'APPROVAL_SELF_FORBIDDEN',
  'REOPEN_DISABLED',
  'SPLIT_DISABLED',
  'SPLIT_NOT_ALLOWED',
  'BULK_DISABLED',
  'BULK_ACTION_NOT_ALLOWED',
  'BULK_CLOSE_FORBIDDEN',
  'BULK_SCOPE_MISMATCH',
  'SAVED_VIEWS_DISABLED',
  'CONFIDENTIAL_ACCESS_DENIED',
  'BREAK_GLASS_DISABLED',
  'CSAT_DISABLED',
  'TICKET_ARCHIVED_READ_ONLY',
];

const unavailableCodes: readonly TicketsErrorCode[] = [
  'ROUTING_UNAVAILABLE',
  'ASSIGNMENT_UNAVAILABLE',
  'ATTACHMENTS_STORAGE_UNAVAILABLE',
  'APPROVALS_UNAVAILABLE',
  'WAITING_FOR_USER_UNAVAILABLE',
  'REOPEN_UNAVAILABLE',
  'SPLIT_UNAVAILABLE',
  'BULK_UNAVAILABLE',
  'SAVED_VIEWS_UNAVAILABLE',
  'CLOSE_CODES_UNAVAILABLE',
  'REQUIRED_FIELDS_UNAVAILABLE',
  'REDACTION_UNAVAILABLE',
  'CONFIDENTIAL_UNAVAILABLE',
  'GUARDRAILS_UNAVAILABLE',
  'CSAT_UNAVAILABLE',
  'ARCHIVE_UNAVAILABLE',
];

export function mapTicketError(error: unknown): HttpException {
  if (!(error instanceof TicketsError)) {
    throw error;
  }
  const body =
    error.details === undefined
      ? { code: error.code, message: ticketErrorMessages[error.code] }
      : {
          code: error.code,
          message: ticketErrorMessages[error.code],
          details: error.details,
        };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  if (forbiddenCodes.includes(error.code)) {
    return new ForbiddenException(body);
  }
  if (unavailableCodes.includes(error.code)) {
    return new ServiceUnavailableException(body);
  }
  if (
    error.code === 'OVERLAPPING_TIMER' ||
    error.code === 'SAVED_VIEW_NAME_TAKEN' ||
    error.code === 'DUPLICATE_TICKET_BLOCKED' ||
    error.code === 'CSAT_ALREADY_SUBMITTED'
  ) {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}
