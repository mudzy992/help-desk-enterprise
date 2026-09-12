import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import { countBusinessMinutes } from './count-business-minutes';
import type {
  TicketSlaElapsedMinutes,
  TicketSlaStateRecord,
} from './ticket-sla.types';

export function slaEffectiveClockTime(
  state: Pick<TicketSlaStateRecord, 'pausedAt'>,
  now: Date,
): Date {
  return state.pausedAt ?? now;
}

export function computeElapsedSlaMinutes(
  calendar: BusinessMinutesCalendar,
  state: TicketSlaStateRecord,
  now: Date,
): TicketSlaElapsedMinutes {
  return {
    responseMinutes: elapsedUntil(
      calendar,
      state,
      state.respondedAt ?? slaEffectiveClockTime(state, now),
    ),
    resolutionMinutes: elapsedUntil(
      calendar,
      state,
      state.resolutionCompletedAt ?? slaEffectiveClockTime(state, now),
    ),
  };
}

function elapsedUntil(
  calendar: BusinessMinutesCalendar,
  state: TicketSlaStateRecord,
  end: Date,
): number {
  const raw = countBusinessMinutes(calendar, state.startedAt, end);
  return Math.max(0, raw - state.pausedBusinessMinutes);
}
