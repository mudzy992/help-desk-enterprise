import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import { listDueSlaEscalations } from './select-due-sla-escalations';
import type { SlaConfiguration } from './sla.types';
import type {
  SlaEscalationRuleRecord,
  TicketSlaStateRecord,
} from './ticket-sla.types';

export function applyDueSlaEscalations(
  state: TicketSlaStateRecord,
  rules: readonly SlaEscalationRuleRecord[],
  calendar: BusinessMinutesCalendar | null,
  configuration: SlaConfiguration,
  now: Date,
): TicketSlaStateRecord {
  if (!configuration.escalationsEnabled) {
    return state;
  }
  const keys = new Set(state.firedEscalationKeys);
  for (const item of listDueSlaEscalations(state, rules, calendar, now)) {
    keys.add(item.key);
  }
  return { ...state, firedEscalationKeys: [...keys] };
}
