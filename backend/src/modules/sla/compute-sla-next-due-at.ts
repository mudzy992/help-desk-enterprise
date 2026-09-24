import { addBusinessMinutes } from './add-business-minutes';
import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import { slaEscalationKey } from './select-due-sla-escalations';
import { defaultSlaEscalationRuleId } from './sla.constants';
import type { SlaConfiguration } from './sla.types';
import type {
  SlaClockKind,
  SlaEscalationRuleRecord,
  TicketSlaStateRecord,
} from './ticket-sla.types';

/**
 * Phase 2.1 (plan §2.1): the moment this SLA state has to be looked at again.
 *
 * The scanner used to load every open state on every tick. With this column the
 * scan is `WHERE resolutionCompletedAt IS NULL AND nextDueAt <= now()`, i.e. it
 * only visits the states whose next transition is actually due.
 *
 * The value is the earliest pending transition instant, one of:
 *
 * - the at-risk mark (`dueAt - notifyBeforeOverdueMinutes`) while the clock is
 *   neither answered in time nor breached … yet;
 * - the breach itself, which happens the instant the clock passes `dueAt`;
 * - an escalation that has not fired yet, once its clock is breached
 *   (`dueAt + triggerOffsetMinutes` in business minutes for positive offsets,
 *   the breach instant itself for offsets that fire immediately).
 *
 * `null` means "nothing time-driven can change this state": it is completed, it
 * is paused (the effective clock is frozen, a resume is an event), or both
 * clocks are settled. Event-driven changes (status, reply, resume) go through
 * `syncTicketSlaTimers` and rewrite this value in the same request.
 *
 * Instants in the past are kept as they are: the state is then due right now,
 * which is exactly what `<= now()` means.
 */
export const slaNextDueEpsilonMilliseconds = 1;

type NextDueAtState = Pick<
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
  | 'firedEscalationKeys'
>;

const slaClockKinds: readonly SlaClockKind[] = ['response', 'resolution'];

export function computeSlaNextDueAt(input: {
  readonly state: NextDueAtState;
  readonly rules: readonly SlaEscalationRuleRecord[];
  readonly calendar: BusinessMinutesCalendar | null;
  readonly configuration: SlaConfiguration;
}): Date | null {
  const { state, configuration } = input;
  if (!configuration.enabled) {
    return null;
  }
  if (state.resolutionCompletedAt !== null || state.pausedAt !== null) {
    return null;
  }
  const candidates: number[] = [];
  for (const kind of slaClockKinds) {
    collectClockCandidates(kind, input, candidates);
  }
  if (candidates.length === 0) {
    return null;
  }
  return new Date(Math.min(...candidates));
}

function collectClockCandidates(
  kind: SlaClockKind,
  input: {
    readonly state: NextDueAtState;
    readonly rules: readonly SlaEscalationRuleRecord[];
    readonly calendar: BusinessMinutesCalendar | null;
    readonly configuration: SlaConfiguration;
  },
  candidates: number[],
): void {
  const { state, configuration } = input;
  const dueAt = kind === 'response' ? state.responseDueAt : state.resolutionDueAt;
  if (dueAt === null) {
    return;
  }
  const breached =
    kind === 'response' ? state.isResponseBreached : state.isResolutionBreached;
  const completed =
    kind === 'response' ? state.respondedAt : state.resolutionCompletedAt;
  if (!breached) {
    if (completed !== null) {
      // Answered in time: the breach check reads `respondedAt` from here on and
      // an escalation needs a breached clock, so this clock is settled.
      return;
    }
    const atRisk =
      kind === 'response' ? state.isResponseAtRisk : state.isResolutionAtRisk;
    if (!atRisk) {
      candidates.push(
        dueAt.getTime() -
          configuration.notifyBeforeOverdueMinutes * 60_000,
      );
    }
    candidates.push(dueAt.getTime() + slaNextDueEpsilonMilliseconds);
    return;
  }
  if (!configuration.escalationsEnabled) {
    return;
  }
  const fired = new Set(state.firedEscalationKeys);
  for (const rule of resolveEscalationRules(input.rules, state)) {
    if (fired.has(slaEscalationKey(kind, rule.id))) {
      continue;
    }
    if (rule.triggerOffsetMinutes <= 0) {
      // `isOffsetElapsed` fires these as soon as the clock passed `dueAt`.
      candidates.push(dueAt.getTime());
      continue;
    }
    if (input.calendar === null) {
      // Without a calendar the offset can never elapse (`isOffsetElapsed`
      // returns false), so there is no future instant to schedule.
      continue;
    }
    try {
      candidates.push(
        addBusinessMinutes(input.calendar, dueAt, rule.triggerOffsetMinutes).getTime() +
          slaNextDueEpsilonMilliseconds,
      );
    } catch {
      // A calendar without business hours cannot schedule an escalation; the
      // scanner would fail the same way, so the state simply stays out of the
      // schedule for this rule.
      continue;
    }
  }
}

function resolveEscalationRules(
  rules: readonly SlaEscalationRuleRecord[],
  state: NextDueAtState,
): readonly SlaEscalationRuleRecord[] {
  if (rules.length > 0) {
    return rules;
  }
  return [
    {
      id: defaultSlaEscalationRuleId,
      slaProfileId: '',
      triggerOffsetMinutes: 0,
      targetGroupId: null,
      targetRole: null,
      targetUserId: null,
    },
  ];
}
