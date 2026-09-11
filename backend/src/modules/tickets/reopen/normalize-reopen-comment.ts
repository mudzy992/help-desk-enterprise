import { ticketReopenConstants } from './reopen.constants';
import { TicketsError } from '../tickets.error';

export function normalizeReopenComment(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const comment = value.trim();
  if (comment.length === 0) {
    return null;
  }
  if (comment.length > ticketReopenConstants.maximumCommentLength) {
    throw new TicketsError('INVALID_REOPEN_COMMENT');
  }
  return comment;
}
