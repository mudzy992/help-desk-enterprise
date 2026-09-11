import type { TicketPriority } from '../../generated/prisma/enums';
import type { ChangeLogDiffPayload } from '../change-log/change-log.types';
import type { SlaProfileRecord, SlaRuleRecord, WeeklyHours } from './sla.types';

export type InMemorySlaChangeLog = {
  id: string;
  entityType: string;
  entityId: string;
  reason: string;
  diff: ChangeLogDiffPayload;
  actorUserId: string | null;
  createdAt: Date;
};

export type CalendarCreateData = {
  key: string;
  name: string;
  timezone: string;
  weeklyHours: WeeklyHours;
  isActive: boolean;
  holidays?: { create: readonly { date: Date; name: string }[] };
};

export type ProfileCreateData = {
  key: string;
  name: string;
  description: string | null;
  calendarId: string;
  isActive: boolean;
};

export type RuleCreateData = {
  slaProfileId: string;
  priority: TicketPriority;
  responseMinutes: number;
  resolutionMinutes: number;
  evaluationOrder: number;
  organizationalUnitId: string | null;
  serviceId: string | null;
};

export function throwDuplicateSlaKey(): never {
  throw { code: 'P2002', meta: { target: ['key'] } };
}

export function filterSlaRules(
  rules: readonly SlaRuleRecord[],
  where?: { slaProfileId?: string; priority?: TicketPriority },
): SlaRuleRecord[] {
  return [...rules]
    .filter((rule) => {
      if (where?.slaProfileId !== undefined && rule.slaProfileId !== where.slaProfileId) {
        return false;
      }
      return where?.priority === undefined || rule.priority === where.priority;
    })
    .sort((left, right) =>
      left.evaluationOrder === right.evaluationOrder
        ? left.id.localeCompare(right.id)
        : left.evaluationOrder - right.evaluationOrder,
    );
}

export function filterSlaProfiles(
  profiles: readonly SlaProfileRecord[],
  where?: { calendarId?: string; isActive?: boolean },
): SlaProfileRecord[] {
  return [...profiles].filter((profile) => {
    if (where?.calendarId !== undefined && profile.calendarId !== where.calendarId) {
      return false;
    }
    return where?.isActive === undefined || profile.isActive === where.isActive;
  });
}
