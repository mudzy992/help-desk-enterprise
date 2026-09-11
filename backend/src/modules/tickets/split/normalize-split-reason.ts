import { TicketsError } from '../tickets.error';
import { ticketSplitConstants } from './split.constants';
import type { TicketSplitConfiguration } from './split.types';

export function normalizeSplitReason(
  reason: string | undefined,
  configuration: TicketSplitConfiguration,
): string | null {
  const trimmed = reason?.trim() ?? '';
  if (trimmed.length === 0) {
    if (configuration.requireReason) {
      throw new TicketsError('SPLIT_REQUIRED');
    }
    return null;
  }
  if (trimmed.length > ticketSplitConstants.maximumReasonLength) {
    throw new TicketsError('INVALID_SPLIT_REASON');
  }
  return trimmed;
}
