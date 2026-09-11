export type TicketsErrorCode =
  | 'NOT_FOUND'
  | 'ORIGIN_UNIT_NOT_FOUND'
  | 'ORIGIN_UNIT_REQUIRED'
  | 'SERVICE_NOT_FOUND'
  | 'SERVICE_REQUIRED'
  | 'SERVICE_NOT_OFFERED'
  | 'FORM_VERSION_REQUIRED'
  | 'FORM_VERSION_NOT_FOUND'
  | 'FORM_VERSION_SERVICE_MISMATCH'
  | 'FORM_VERSION_NOT_ACTIVE'
  | 'INVALID_STATUS_TRANSITION'
  | 'STATUS_CHANGE_FORBIDDEN'
  | 'FORBIDDEN'
  | 'INVALID_TITLE'
  | 'INVALID_DESCRIPTION'
  | 'REQUESTER_NOT_FOUND'
  | 'ROUTING_UNAVAILABLE'
  | 'ASSIGNMENT_UNAVAILABLE'
  | 'GROUP_INBOX_DISABLED'
  | 'TICKET_NOT_CLAIMABLE';

export class TicketsError extends Error {
  constructor(
    readonly code: TicketsErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'TicketsError';
  }
}
