import type { TicketSlaStateRecord } from './ticket-sla.types';

export function applyTicketSlaPause(
  state: TicketSlaStateRecord,
  now: Date,
): TicketSlaStateRecord {
  if (state.pausedAt !== null) {
    return state;
  }
  return { ...state, pausedAt: now };
}
