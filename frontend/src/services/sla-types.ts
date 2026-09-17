export type WeeklyHours = {
  readonly [weekday: string]: readonly { readonly start: string; readonly end: string }[];
};

export type SlaHoliday = {
  readonly id?: string;
  readonly date: string;
  readonly name: string;
};

export type BusinessHoursCalendar = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly timezone: string;
  readonly weeklyHours: WeeklyHours;
  readonly isActive: boolean;
  readonly holidays: readonly SlaHoliday[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SlaProfile = {
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

export type SlaRule = {
  readonly id: string;
  readonly slaProfileId: string;
  readonly priority: string;
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

export type SlaChangeLogEntry = {
  readonly id: string;
  readonly reason: string;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly createdAt: string;
  readonly diff: {
    readonly action: string;
    readonly changes: readonly {
      readonly path: string;
      readonly before: unknown;
      readonly after: unknown;
    }[];
  };
};

export type CalendarWriteInput = {
  readonly key?: string;
  readonly name: string;
  readonly timezone: string;
  readonly weeklyHours: WeeklyHours;
  readonly holidays: readonly SlaHoliday[];
  readonly isActive: boolean;
  readonly reason: string;
};

export type ProfileWriteInput = {
  readonly key?: string;
  readonly name: string;
  readonly description: string;
  readonly calendarId: string;
  readonly isActive: boolean;
  readonly reason: string;
};

export type RuleWriteInput = {
  readonly slaProfileId?: string;
  readonly priority: string;
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
  readonly evaluationOrder: number;
  readonly organizationalUnitId: string;
  readonly serviceId: string;
  readonly reason: string;
};

export type SlaEscalationRule = {
  readonly id: string;
  readonly slaProfileId: string;
  readonly triggerOffsetMinutes: number;
  readonly level: number;
  readonly targetGroupId: string | null;
  readonly targetRole: string | null;
  readonly targetUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EscalationRuleWriteInput = {
  readonly slaProfileId?: string;
  readonly triggerOffsetMinutes: number;
  readonly targetGroupId: string;
  readonly targetRole: string;
  readonly targetUserId: string;
  readonly reason: string;
};
