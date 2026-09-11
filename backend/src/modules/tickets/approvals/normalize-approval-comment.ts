import { ticketApprovalConstants } from './approvals.constants';
import { TicketsError } from '../tickets.error';

export function normalizeApprovalComment(value: string): string {
  const comment = value.trim();
  if (comment.length === 0) {
    throw new TicketsError('APPROVAL_COMMENT_REQUIRED');
  }
  if (comment.length > ticketApprovalConstants.maximumCommentLength) {
    throw new TicketsError('INVALID_APPROVAL_COMMENT');
  }
  return comment;
}
