export const slaChangeLogEntityTypes = {
  calendar: 'business_hours_calendar',
  profile: 'sla_profile',
  rule: 'sla_rule',
} as const;

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
