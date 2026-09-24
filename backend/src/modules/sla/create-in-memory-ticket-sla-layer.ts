import { createInMemoryCalendarDelegate } from './in-memory-sla-calendar-delegate';
import { createInMemoryProfileDelegate } from './in-memory-sla-profile-delegate';
import { createInMemoryRuleDelegate } from './in-memory-sla-rule-delegate';
import { createInMemorySlaEscalationRuleDelegate } from './in-memory-sla-escalation-rule-delegate';
import { createInMemoryTicketSlaStateDelegate } from './create-in-memory-ticket-sla-state-delegate';
import type {
  BusinessHoursCalendarRecord,
  SlaProfileRecord,
  SlaRuleRecord,
} from './sla.types';
import type { InMemoryTicketRelations } from '../tickets/in-memory-ticket-where';
import type { TicketRecord } from '../tickets/tickets.types';
import type {
  SlaEscalationRuleRecord,
  TicketSlaStateRecord,
} from './ticket-sla.types';

export function createInMemoryTicketSlaLayer(
  nextId: (prefix: string) => string,
  now: () => Date,
  findTicket: (ticketId: string) => TicketRecord | null = () => null,
  getTicketRelations: () => InMemoryTicketRelations = () => ({}),
) {
  const slaStates = new Map<string, TicketSlaStateRecord>();
  const calendars = new Map<string, BusinessHoursCalendarRecord>();
  const profiles = new Map<string, SlaProfileRecord>();
  const rules = new Map<string, SlaRuleRecord>();
  const escalations = new Map<string, SlaEscalationRuleRecord>();
  return {
    slaStates,
    calendars,
    profiles,
    rules,
    escalations,
    delegates: {
      ticketSlaState: createInMemoryTicketSlaStateDelegate(
        slaStates,
        nextId,
        now,
        findTicket,
        getTicketRelations,
      ),
      businessHoursCalendar: createInMemoryCalendarDelegate(calendars, nextId, now),
      slaProfile: createInMemoryProfileDelegate(profiles, rules, nextId, now),
      slaRule: createInMemoryRuleDelegate(rules, nextId, now),
      slaEscalationRule: createInMemorySlaEscalationRuleDelegate(
        escalations,
        nextId,
      ),
    },
  };
}
