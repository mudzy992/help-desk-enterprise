import type { ChangeLogDiffPayload } from '../change-log/change-log.types';
import { createInMemoryCalendarDelegate } from './in-memory-sla-calendar-delegate';
import { createInMemorySlaEscalationRuleDelegate } from './in-memory-sla-escalation-rule-delegate';
import { createInMemoryProfileDelegate } from './in-memory-sla-profile-delegate';
import { createInMemoryRuleDelegate } from './in-memory-sla-rule-delegate';
import type { InMemorySlaChangeLog } from './in-memory-sla-store';
import type {
  BusinessHoursCalendarRecord,
  SlaProfileRecord,
  SlaRuleRecord,
} from './sla.types';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

export type { InMemorySlaChangeLog } from './in-memory-sla-store';

export function createInMemorySlaPrisma() {
  const calendars = new Map<string, BusinessHoursCalendarRecord>();
  const profiles = new Map<string, SlaProfileRecord>();
  const rules = new Map<string, SlaRuleRecord>();
  const escalations = new Map<string, SlaEscalationRuleRecord>();
  const units = new Map<string, { id: string; ouPath: string }>();
  const services = new Map<string, { id: string; name: string; slaProfileId: string | null }>();
  const policyPacks = new Map<string, { id: string; slaProfileId: string | null }>();
  const boundServices = new Map<string, { id: string; slaProfileId: string | null }>();
  const changeLogs: InMemorySlaChangeLog[] = [];
  const users = new Map<string, { id: string; displayName: string }>();
  let nextIdentifier = 1;
  const now = () => new Date('2026-09-11T08:00:00.000Z');
  const nextId = (prefix: string) => `${prefix}-${nextIdentifier++}`;

  const prisma = {
    businessHoursCalendar: createInMemoryCalendarDelegate(calendars, nextId, now),
    calendarHoliday: {
      deleteMany: async ({ where }: { where: { calendarId: string } }) => {
        const calendar = calendars.get(where.calendarId);
        if (calendar !== undefined) {
          calendars.set(where.calendarId, { ...calendar, holidays: [] });
        }
        return { count: calendar?.holidays.length ?? 0 };
      },
    },
    slaProfile: createInMemoryProfileDelegate(profiles, rules, nextId, now),
    slaRule: createInMemoryRuleDelegate(rules, nextId, now),
    slaEscalationRule: createInMemorySlaEscalationRuleDelegate(
      escalations,
      nextId,
    ),
    organizationalUnit: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        units.get(where.id) ?? null,
      findMany: async ({
        where,
      }: { where?: { id?: { in: readonly string[] } } } = {}) =>
        [...units.values()].filter((unit) =>
          where?.id === undefined ? true : where.id.in.includes(unit.id),
        ),
    },
    service: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        services.get(where.id) ?? boundServices.get(where.id) ?? null,
      findMany: async ({
        where,
      }: {
        where?: { id?: { in: readonly string[] }; slaProfileId?: string };
      } = {}) =>
        [...services.values(), ...boundServices.values()].filter((service) => {
          if (where?.id !== undefined) {
            return where.id.in.includes(service.id);
          }
          return where?.slaProfileId === undefined
            ? true
            : service.slaProfileId === where.slaProfileId;
        }),
      count: async ({ where }: { where: { slaProfileId: string } }) =>
        [...boundServices.values()].filter(
          (service) => service.slaProfileId === where.slaProfileId,
        ).length,
    },
    policyPack: {
      count: async ({ where }: { where: { slaProfileId: string } }) =>
        [...policyPacks.values()].filter(
          (pack) => pack.slaProfileId === where.slaProfileId,
        ).length,
    },
    changeLog: {
      create: async ({
        data,
      }: {
        data: Omit<InMemorySlaChangeLog, 'id' | 'createdAt'> & {
          diff: ChangeLogDiffPayload;
        };
      }) => {
        const created: InMemorySlaChangeLog = {
          ...data,
          id: nextId('log'),
          createdAt: now(),
        };
        changeLogs.push(created);
        return created;
      },
      findMany: async ({
        where,
      }: {
        where: { entityType: string; entityId: string };
      }) =>
        changeLogs
          .filter(
            (entry) =>
              entry.entityType === where.entityType &&
              entry.entityId === where.entityId,
          )
          .slice()
          .reverse()
          .map((entry) => ({
            ...entry,
            actor: entry.actorUserId ? (users.get(entry.actorUserId) ?? null) : null,
          })),
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(prisma),
  };

  return {
    prisma,
    changeLogs,
    seedUnit: (unit: { id: string; ouPath: string }) => units.set(unit.id, unit),
    seedService: (service: { id: string; name: string }) =>
      services.set(service.id, { ...service, slaProfileId: null }),
    seedBoundService: (service: { id: string; slaProfileId: string | null }) =>
      boundServices.set(service.id, service),
    seedPolicyPack: (pack: { id: string; slaProfileId: string | null }) =>
      policyPacks.set(pack.id, pack),
    seedUser: (user: { id: string; displayName: string }) =>
      users.set(user.id, user),
  };
}
