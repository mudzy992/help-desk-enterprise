import type { TicketsErrorCode } from '../tickets.error';
import { TicketsError } from '../tickets.error';
import { ticketMergeConstants } from './merge.constants';

/** 3–500 characters after collapsing whitespace (P2, M5, M6). */
export function normalizeRequiredReason(
  reason: string | undefined,
  errorCode: TicketsErrorCode,
): string {
  const normalized = (reason ?? '').replace(/\s+/g, ' ').trim();
  if (
    normalized.length < ticketMergeConstants.minimumReasonLength ||
    normalized.length > ticketMergeConstants.maximumReasonLength
  ) {
    throw new TicketsError(errorCode);
  }
  return normalized;
}
