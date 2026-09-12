import type { TicketSlaStateRecord } from './ticket-sla.types';

export function markTicketSlaResponded(
  state: TicketSlaStateRecord,
  now: Date,
): TicketSlaStateRecord {
  if (state.respondedAt !== null) {
    return state;
  }
  return { ...state, respondedAt: state.pausedAt ?? now };
}

export function markTicketSlaResolutionCompleted(
  state: TicketSlaStateRecord,
  now: Date,
): TicketSlaStateRecord {
  if (state.resolutionCompletedAt !== null) {
    return state;
  }
  return { ...state, resolutionCompletedAt: state.pausedAt ?? now };
}
