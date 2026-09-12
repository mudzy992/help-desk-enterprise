import { addBusinessMinutes } from './add-business-minutes';
import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import { slaEffectiveClockTime } from './compute-elapsed-sla-minutes';
import { defaultSlaEscalationRuleId } from './sla.constants';
import type {
  SlaClockKind,
  SlaEscalationRuleRecord,
  TicketSlaStateRecord,
} from './ticket-sla.types';

const slaClockKinds: readonly SlaClockKind[] = ['response', 'resolution'];

export function slaEscalationKey(
  kind: SlaClockKind,
  ruleId: string,
): string {
  return `${kind}:${ruleId}`;
}

export function parseSlaEscalationKey(
  key: string,
): { readonly kind: SlaClockKind; readonly ruleId: string } | null {
  const separator = key.indexOf(':');
  if (separator <= 0) {
    return null;
  }
  const kind = key.slice(0, separator);
  if (kind !== 'response' && kind !== 'resolution') {
    return null;
  }
  return { kind, ruleId: key.slice(separator + 1) };
}

export function listDueSlaEscalations(
  state: TicketSlaStateRecord,
  rules: readonly SlaEscalationRuleRecord[],
  calendar: BusinessMinutesCalendar | null,
  now: Date,
): readonly {
  readonly kind: SlaClockKind;
  readonly rule: SlaEscalationRuleRecord;
  readonly key: string;
}[] {
  const usable = rules.length > 0 ? rules : [defaultEscalationRule(state)];
  const clock = slaEffectiveClockTime(state, now);
  const due: {
    readonly kind: SlaClockKind;
    readonly rule: SlaEscalationRuleRecord;
    readonly key: string;
  }[] = [];
  for (const kind of slaClockKinds) {
    if (!isClockBreached(state, kind)) {
      continue;
    }
    const dueAt = dueAtForClock(state, kind);
    for (const rule of usable) {
      if (isOffsetElapsed(clock, dueAt, rule.triggerOffsetMinutes, calendar)) {
        due.push({
          kind,
          rule,
          key: slaEscalationKey(kind, rule.id),
        });
      }
    }
  }
  return due;
}

export function isClockBreached(
  state: Pick<TicketSlaStateRecord, 'isResponseBreached' | 'isResolutionBreached'>,
  kind: SlaClockKind,
): boolean {
  return kind === 'response' ? state.isResponseBreached : state.isResolutionBreached;
}

export function dueAtForClock(
  state: Pick<TicketSlaStateRecord, 'responseDueAt' | 'resolutionDueAt'>,
  kind: SlaClockKind,
): Date | null {
  return kind === 'response' ? state.responseDueAt : state.resolutionDueAt;
}

function defaultEscalationRule(
  state: TicketSlaStateRecord,
): SlaEscalationRuleRecord {
  return {
    id: defaultSlaEscalationRuleId,
    slaProfileId: state.slaProfileId ?? '',
    triggerOffsetMinutes: 0,
    targetGroupId: null,
  };
}

function isOffsetElapsed(
  clock: Date,
  dueAt: Date | null,
  offsetMinutes: number,
  calendar: BusinessMinutesCalendar | null,
): boolean {
  if (dueAt === null || clock.getTime() <= dueAt.getTime()) {
    return false;
  }
  if (offsetMinutes <= 0) {
    return true;
  }
  if (calendar === null) {
    return false;
  }
  return (
    clock.getTime() > addBusinessMinutes(calendar, dueAt, offsetMinutes).getTime()
  );
}
