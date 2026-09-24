export const slaChangeLogEntityTypes = {
  calendar: 'business_hours_calendar',
  profile: 'sla_profile',
  rule: 'sla_rule',
  escalationRule: 'sla_escalation_rule',
  priorityMatrix: 'priority_matrix',
  ticketSlaState: 'ticket_sla_state',
} as const;

export const slaChangeLogReasons = {
  responseBreached: 'sla_response_breached',
  resolutionBreached: 'sla_resolution_breached',
  responseAtRisk: 'sla_response_at_risk',
  resolutionAtRisk: 'sla_resolution_at_risk',
  responseEscalated: 'sla_response_escalated',
  resolutionEscalated: 'sla_resolution_escalated',
} as const;

export const slaSystemEventActions = {
  responseBreached: 'ticket_sla_response_breached',
  resolutionBreached: 'ticket_sla_resolution_breached',
  responseAtRisk: 'ticket_sla_response_at_risk',
  resolutionAtRisk: 'ticket_sla_resolution_at_risk',
  responseEscalated: 'ticket_sla_response_escalated',
  resolutionEscalated: 'ticket_sla_resolution_escalated',
} as const;

export const defaultSlaEscalationRuleId = 'default';

/**
 * Phase 2.1 (plan §2.1): how many due states one scan cycle processes. The batch
 * is deliberately bounded — a cycle then has a predictable cost, and whatever is
 * left over is picked up by the next one (every state keeps its own
 * `nextDueAt`, so nothing is lost).
 */
export const slaScanBatchSize = 2000;

export const slaConstants = {
  maximumKeyLength: 64,
  maximumNameLength: 120,
  maximumDescriptionLength: 2000,
  maximumHolidayNameLength: 120,
  maximumWeeklyIntervalsPerDay: 4,
  defaultEvaluationOrder: 100,
  defaultTimezone: 'Europe/Sarajevo',
} as const;

export const isoWeekdayKeys = ['1', '2', '3', '4', '5', '6', '7'] as const;

export type IsoWeekdayKey = (typeof isoWeekdayKeys)[number];

export const standardWeeklyHours = {
  '1': [{ start: '08:00', end: '16:00' }],
  '2': [{ start: '08:00', end: '16:00' }],
  '3': [{ start: '08:00', end: '16:00' }],
  '4': [{ start: '08:00', end: '16:00' }],
  '5': [{ start: '08:00', end: '16:00' }],
} as const;
