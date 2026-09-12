import { slaEffectiveClockTime } from './compute-elapsed-sla-minutes';
import type { TicketSlaStateRecord } from './ticket-sla.types';

type BreachFields = Pick<
  TicketSlaStateRecord,
  | 'respondedAt'
  | 'resolutionCompletedAt'
  | 'pausedAt'
  | 'responseDueAt'
  | 'resolutionDueAt'
  | 'isResponseBreached'
  | 'isResolutionBreached'
>;

export function evaluateTicketSlaBreach<T extends BreachFields>(
  state: T,
  now: Date,
): T {
  const clock = slaEffectiveClockTime(state, now);
  return {
    ...state,
    isResponseBreached:
      state.isResponseBreached ||
      isDueBreached(state.respondedAt ?? clock, state.responseDueAt),
    isResolutionBreached:
      state.isResolutionBreached ||
      isDueBreached(state.resolutionCompletedAt ?? clock, state.resolutionDueAt),
  };
}

function isDueBreached(clock: Date, dueAt: Date | null): boolean {
  return dueAt !== null && clock.getTime() > dueAt.getTime();
}
