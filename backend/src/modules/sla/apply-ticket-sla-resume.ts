import { addBusinessMinutes } from './add-business-minutes';
import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import { countBusinessMinutes } from './count-business-minutes';
import type { TicketSlaStateRecord } from './ticket-sla.types';

export function applyTicketSlaResume(
  calendar: BusinessMinutesCalendar,
  state: TicketSlaStateRecord,
  now: Date,
): TicketSlaStateRecord {
  if (state.pausedAt === null) {
    return state;
  }
  const pauseMinutes = countBusinessMinutes(calendar, state.pausedAt, now);
  return {
    ...state,
    pausedAt: null,
    pausedBusinessMinutes: state.pausedBusinessMinutes + pauseMinutes,
    responseDueAt: shiftDueAt(calendar, state.pausedAt, state.responseDueAt, now),
    resolutionDueAt: shiftDueAt(
      calendar,
      state.pausedAt,
      state.resolutionDueAt,
      now,
    ),
  };
}

function shiftDueAt(
  calendar: BusinessMinutesCalendar,
  pausedAt: Date,
  dueAt: Date | null,
  now: Date,
): Date | null {
  if (dueAt === null) {
    return null;
  }
  const remaining = countBusinessMinutes(calendar, pausedAt, dueAt);
  if (remaining <= 0) {
    return dueAt;
  }
  return addBusinessMinutes(calendar, now, remaining);
}
