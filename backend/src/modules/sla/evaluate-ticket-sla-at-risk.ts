import { slaEffectiveClockTime } from './compute-elapsed-sla-minutes';
import type { TicketSlaStateRecord } from './ticket-sla.types';

const millisecondsPerMinute = 60_000;

type AtRiskFields = Pick<
  TicketSlaStateRecord,
  | 'respondedAt'
  | 'resolutionCompletedAt'
  | 'pausedAt'
  | 'responseDueAt'
  | 'resolutionDueAt'
  | 'isResponseBreached'
  | 'isResolutionBreached'
  | 'isResponseAtRisk'
  | 'isResolutionAtRisk'
>;

export function evaluateTicketSlaAtRisk<T extends AtRiskFields>(
  state: T,
  now: Date,
  notifyBeforeOverdueMinutes: number,
): T {
  const clock = slaEffectiveClockTime(state, now);
  return {
    ...state,
    isResponseAtRisk: isClockAtRisk({
      completedAt: state.respondedAt,
      dueAt: state.responseDueAt,
      isBreached: state.isResponseBreached,
      wasAtRisk: state.isResponseAtRisk,
      clock,
      notifyBeforeOverdueMinutes,
    }),
    isResolutionAtRisk: isClockAtRisk({
      completedAt: state.resolutionCompletedAt,
      dueAt: state.resolutionDueAt,
      isBreached: state.isResolutionBreached,
      wasAtRisk: state.isResolutionAtRisk,
      clock,
      notifyBeforeOverdueMinutes,
    }),
  };
}

function isClockAtRisk(input: {
  readonly completedAt: Date | null;
  readonly dueAt: Date | null;
  readonly isBreached: boolean;
  readonly wasAtRisk: boolean;
  readonly clock: Date;
  readonly notifyBeforeOverdueMinutes: number;
}): boolean {
  if (input.isBreached || input.completedAt !== null || input.dueAt === null) {
    return false;
  }
  if (input.wasAtRisk) {
    return true;
  }
  const remainingMinutes =
    (input.dueAt.getTime() - input.clock.getTime()) / millisecondsPerMinute;
  return (
    remainingMinutes > 0 && remainingMinutes <= input.notifyBeforeOverdueMinutes
  );
}
