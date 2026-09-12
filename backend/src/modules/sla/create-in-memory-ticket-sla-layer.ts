import { createInMemoryCalendarDelegate } from './in-memory-sla-calendar-delegate';
import { createInMemoryProfileDelegate } from './in-memory-sla-profile-delegate';
import { createInMemoryRuleDelegate } from './in-memory-sla-rule-delegate';
import { createInMemoryTicketSlaStateDelegate } from './create-in-memory-ticket-sla-state-delegate';
import type {
  BusinessHoursCalendarRecord,
  SlaProfileRecord,
  SlaRuleRecord,
} from './sla.types';
import type { TicketSlaStateRecord } from './ticket-sla.types';

export function createInMemoryTicketSlaLayer(
  nextId: (prefix: string) => string,
  now: () => Date,
) {
  const slaStates = new Map<string, TicketSlaStateRecord>();
  const calendars = new Map<string, BusinessHoursCalendarRecord>();
  const profiles = new Map<string, SlaProfileRecord>();
  const rules = new Map<string, SlaRuleRecord>();
  return {
    slaStates,
    calendars,
    profiles,
    rules,
    delegates: {
      ticketSlaState: createInMemoryTicketSlaStateDelegate(slaStates, nextId, now),
      businessHoursCalendar: createInMemoryCalendarDelegate(calendars, nextId, now),
      slaProfile: createInMemoryProfileDelegate(profiles, rules, nextId, now),
      slaRule: createInMemoryRuleDelegate(rules, nextId, now),
    },
  };
}
