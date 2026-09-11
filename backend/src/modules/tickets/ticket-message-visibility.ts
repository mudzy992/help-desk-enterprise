import type { MessageType } from '../../generated/prisma/enums';
import { staffOnlyMessageTypes } from './collaboration.constants';
import type { TicketMessageVisibility } from './collaboration.types';

export function ticketMessageVisibility(
  type: MessageType,
): TicketMessageVisibility {
  if (
    staffOnlyMessageTypes.includes(
      type as (typeof staffOnlyMessageTypes)[number],
    )
  ) {
    return 'staff';
  }
  return 'public';
}

export function canViewTicketMessage(
  visibility: TicketMessageVisibility,
  type: MessageType,
): boolean {
  return visibility === 'staff' || ticketMessageVisibility(type) === 'public';
}
