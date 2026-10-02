import { HttpException } from '@nestjs/common';
import { ChangeError } from '../changes/changes.constants';
import { TicketsError } from '../tickets/tickets.error';
import type { TeamsTextKey } from './teams-text';

/** Domain error code from tickets (raw or mapped to HTTP) or changes. */
export function domainErrorCode(error: unknown): string | null {
  if (error instanceof TicketsError || error instanceof ChangeError) return error.code;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'object' && response !== null && 'code' in response) return String((response as { code: unknown }).code);
  }
  return null;
}

/** Paket 3.1 (§9): domain errors become one understandable sentence on the card. */
export function teamsErrorTextKey(error: unknown): TeamsTextKey | null {
  const code = domainErrorCode(error);
  if (code === null) return null;
  if (['FORBIDDEN', 'STATUS_CHANGE_FORBIDDEN', 'MESSAGE_TYPE_NOT_ALLOWED', 'CHANGE_FORBIDDEN', 'CHANGE_OUT_OF_SCOPE', 'CHANGE_NOT_APPROVER', 'CHANGE_MODULE_DISABLED', 'APPROVALS_DISABLED', 'SERVICE_NOT_OFFERED', 'APPROVAL_TRANSITION_FORBIDDEN', 'APPROVAL_SELF_FORBIDDEN'].includes(code)) return 'errForbidden';
  if (['TICKET_NOT_CLAIMABLE', 'INVALID_STATUS_TRANSITION', 'CHANGE_VERSION_CONFLICT', 'CHANGE_ALREADY_VOTED', 'CHANGE_NOT_IN_AUTHORIZATION', 'APPROVAL_ALREADY_DECIDED', 'APPROVAL_NOT_PENDING'].includes(code)) return 'errStale';
  if (['NOT_FOUND', 'CHANGE_NOT_FOUND', 'APPROVAL_NOT_FOUND', 'SERVICE_NOT_FOUND'].includes(code)) return 'errNotFound';
  if (['CHANGE_REASON_REQUIRED', 'APPROVAL_COMMENT_REQUIRED'].includes(code)) return 'errReasonRequired';
  if (code.startsWith('INVALID_') || code.endsWith('_REQUIRED') || code === 'CHANGE_VALIDATION') return 'errInvalid';
  return null;
}
