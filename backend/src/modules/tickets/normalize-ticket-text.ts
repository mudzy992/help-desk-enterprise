import { ticketConstants } from './tickets.constants';
import { TicketsError } from './tickets.error';

export function normalizeTicketTitle(value: string): string {
  const title = value.trim();
  if (
    title.length === 0 ||
    title.length > ticketConstants.maximumTitleLength
  ) {
    throw new TicketsError('INVALID_TITLE');
  }
  return title;
}

export function normalizeTicketDescription(value: string): string {
  const description = value.trim();
  if (
    description.length === 0 ||
    description.length > ticketConstants.maximumDescriptionLength
  ) {
    throw new TicketsError('INVALID_DESCRIPTION');
  }
  return description;
}
