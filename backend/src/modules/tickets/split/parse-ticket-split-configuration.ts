import { TicketsError } from '../tickets.error';
import { defaultTicketSplitConfiguration } from './split.constants';
import type { TicketSplitConfiguration } from './split.types';

export function parseTicketSplitConfiguration(input: {
  readonly addonEnabled: unknown;
  readonly enabled: unknown;
  readonly allowAttachmentMove: unknown;
  readonly allowMessageCopy: unknown;
  readonly requireReason: unknown;
}): TicketSplitConfiguration {
  if (input.addonEnabled !== true || input.enabled !== true) {
    return { ...defaultTicketSplitConfiguration, enabled: false };
  }
  if (
    typeof input.allowAttachmentMove !== 'boolean' ||
    typeof input.allowMessageCopy !== 'boolean' ||
    typeof input.requireReason !== 'boolean'
  ) {
    throw new TicketsError('SPLIT_UNAVAILABLE');
  }
  return {
    enabled: true,
    allowAttachmentMove: input.allowAttachmentMove,
    allowMessageCopy: input.allowMessageCopy,
    requireReason: input.requireReason,
  };
}
