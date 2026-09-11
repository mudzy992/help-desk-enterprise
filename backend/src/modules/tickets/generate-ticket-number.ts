import { ticketConstants } from './tickets.constants';

export function formatTicketNumber(sequence: number): string {
  return `${ticketConstants.ticketNumberPrefix}${String(sequence).padStart(
    ticketConstants.ticketNumberPad,
    '0',
  )}`;
}

export async function nextTicketNumber(
  countExisting: () => Promise<number>,
): Promise<string> {
  return formatTicketNumber((await countExisting()) + 1);
}
