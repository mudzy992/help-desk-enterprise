import type { TicketPriority } from '../../generated/prisma/enums';
import type { ChangeLogDiffPayload } from '../change-log/change-log.types';
import type { IsoWeekdayKey } from './sla.constants';

export type BusinessHoursInterval = {
  readonly start: string;
  readonly end: string;
};

export type WeeklyHours = {
  readonly [weekday in IsoWeekdayKey]?: readonly BusinessHoursInterval[];
};

export type CalendarHolidayInput = {
  readonly date: string;
  readonly name: string;
};

export type CalendarHolidayRecord = CalendarHolidayInput & {
  readonly id: string;
};

export type BusinessHoursCalendarRecord = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly timezone: string;
  readonly weeklyHours: WeeklyHours;
  readonly isActive: boolean;
  readonly holidays: readonly CalendarHolidayRecord[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SlaProfileRecord = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly calendarId: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SlaRuleRecord = {
  readonly id: string;
  readonly slaProfileId: string;
  readonly priority: TicketPriority;
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
  readonly evaluationOrder: number;
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SlaMutationContext = {
  readonly actorUserId: string | null;
};

export type SlaConfiguration = {
  readonly enabled: boolean;
  readonly requireReason: boolean;
  readonly allowServiceOverrides: boolean;
  readonly allowOuOverrides: boolean;
  readonly pauseOnWaitingForUser: boolean;
  readonly pauseOnPendingApproval: boolean;
  readonly escalationsEnabled: boolean;
};

export type CalendarWriteInput = {
  readonly key: string;
  readonly name: string;
  readonly timezone: string;
  readonly weeklyHours: unknown;
  readonly holidays?: readonly CalendarHolidayInput[];
  readonly isActive?: boolean;
  readonly reason: string;
};

export type UpdateCalendarInput = {
  readonly name?: string;
  readonly timezone?: string;
  readonly weeklyHours?: unknown;
  readonly holidays?: readonly CalendarHolidayInput[];
  readonly isActive?: boolean;
  readonly reason: string;
};

export type ProfileWriteInput = {
  readonly key: string;
  readonly name: string;
  readonly description?: string | null;
  readonly calendarId: string;
  readonly isActive?: boolean;
  readonly reason: string;
};

export type UpdateProfileInput = {
  readonly name?: string;
  readonly description?: string | null;
  readonly calendarId?: string;
  readonly isActive?: boolean;
  readonly reason: string;
};

export type RuleWriteInput = {
  readonly slaProfileId: string;
  readonly priority: TicketPriority;
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
  readonly evaluationOrder?: number;
  readonly organizationalUnitId?: string | null;
  readonly serviceId?: string | null;
  readonly reason: string;
};

export type UpdateRuleInput = {
  readonly priority?: TicketPriority;
  readonly responseMinutes?: number;
  readonly resolutionMinutes?: number;
  readonly evaluationOrder?: number;
  readonly organizationalUnitId?: string | null;
  readonly serviceId?: string | null;
  readonly reason: string;
};

export type ResolveSlaTargetsInput = {
  readonly slaProfileId: string;
  readonly priority: TicketPriority;
  readonly serviceId?: string;
  readonly organizationalUnitId?: string;
  readonly startedAt?: string;
};

export type BusinessHoursCalendarResponse = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly timezone: string;
  readonly weeklyHours: WeeklyHours;
  readonly isActive: boolean;
  readonly holidays: readonly CalendarHolidayRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SlaProfileResponse = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly calendarId: string;
  readonly calendarName: string;
  readonly calendarTimezone: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SlaRuleResponse = {
  readonly id: string;
  readonly slaProfileId: string;
  readonly priority: TicketPriority;
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
  readonly evaluationOrder: number;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnitPath: string | null;
  readonly serviceId: string | null;
  readonly serviceName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SlaChangeLogResponse = {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: string;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly createdAt: string;
  readonly diff: ChangeLogDiffPayload;
};

export type SlaTargetsResponse = {
  readonly slaProfileId: string;
  readonly slaRuleId: string;
  readonly calendarId: string;
  readonly priority: TicketPriority;
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
  readonly startedAt: string;
  readonly responseDueAt: string;
  readonly resolutionDueAt: string;
};
