import { ticketCloseCodeConstants } from './close-codes.constants';
import { TicketsError } from '../tickets.error';

export function normalizeResolutionNote(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const note = value.trim();
  if (note.length === 0) {
    return null;
  }
  if (note.length > ticketCloseCodeConstants.maximumResolutionNoteLength) {
    throw new TicketsError('INVALID_RESOLUTION_NOTE');
  }
  return note;
}

export function normalizeCloseCodeKey(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const key = value.trim();
  if (key.length === 0) {
    return null;
  }
  if (key.length > ticketCloseCodeConstants.maximumKeyLength) {
    throw new TicketsError('CLOSE_CODE_INVALID');
  }
  return key;
}
