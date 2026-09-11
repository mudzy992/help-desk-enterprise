import { createInMemoryFormVersionDelegate } from '../service-catalog/create-in-memory-form-version-delegate';
import type { FormVersionRecord } from '../service-catalog/service-forms.types';
import {
  matchesInMemoryRoutingRule,
  pickInMemoryFields,
  type InMemoryRoutingRuleWhere,
} from '../routing/in-memory-routing-store';
import type { RoutingRuleRecord } from '../routing/routing.types';
import { createInMemoryTicketDelegate } from './create-in-memory-ticket-delegate';
import type { TicketRecord } from './tickets.types';

export type InMemoryTicketUnit = {
  readonly id: string;
  readonly parentId: string | null;
  readonly ouPath: string;
};

export type InMemoryTicketService = {
  readonly id: string;
  readonly name: string;
  readonly lifecycle: string;
  readonly availability: string;
  readonly classification: string;
  readonly isConfidentialDefault: boolean;
};

export type InMemoryTicketUser = {
  readonly id: string;
  readonly organizationalUnitId: string | null;
};

export type InMemoryTicketGroup = {
  readonly id: string;
  readonly name: string;
};

export type InMemoryTicketChangeLog = {
  entityType: string;
  entityId: string;
  reason: string;
  diff: object;
  actorUserId: string | null;
};

export function createInMemoryTicketsPrisma() {
  const units = new Map<string, InMemoryTicketUnit>();
  const services = new Map<string, InMemoryTicketService>();
  const groups = new Map<string, InMemoryTicketGroup>();
  const users = new Map<string, InMemoryTicketUser>();
  const rules = new Map<string, RoutingRuleRecord>();
  const formVersions = new Map<string, FormVersionRecord>();
  const tickets = new Map<string, TicketRecord>();
  const changeLogs: InMemoryTicketChangeLog[] = [];
  let nextIdentifier = 1;
  const now = () => new Date('2026-09-11T12:00:00.000Z');
  const nextId = () => `ticket-record-${nextIdentifier++}`;

  const prisma = {
    organizationalUnit: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => pickInMemoryFields(units.get(where.id), select),
      findMany: async ({
        where,
        select,
      }: {
        where?: { id?: { in: readonly string[] } };
        select?: Record<string, boolean>;
      } = {}) =>
        [...units.values()]
          .filter((unit) =>
            where?.id === undefined ? true : where.id.in.includes(unit.id),
          )
          .map((unit) => pickInMemoryFields(unit, select)),
    },
    service: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => pickInMemoryFields(services.get(where.id), select),
      findMany: async ({
        where,
        select,
      }: {
        where?: { id?: { in: readonly string[] } };
        select?: Record<string, boolean>;
      } = {}) =>
        [...services.values()]
          .filter((service) =>
            where?.id === undefined ? true : where.id.in.includes(service.id),
          )
          .map((service) => pickInMemoryFields(service, select)),
    },
    group: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => pickInMemoryFields(groups.get(where.id), select),
      findMany: async ({
        where,
        select,
      }: {
        where?: { id?: { in: readonly string[] } };
        select?: Record<string, boolean>;
      } = {}) =>
        [...groups.values()]
          .filter((group) =>
            where?.id === undefined ? true : where.id.in.includes(group.id),
          )
          .map((group) => pickInMemoryFields(group, select)),
    },
    user: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => pickInMemoryFields(users.get(where.id), select),
    },
    routingRule: {
      findMany: async ({
        where,
      }: {
        where?: InMemoryRoutingRuleWhere;
      } = {}) =>
        [...rules.values()].filter((rule) =>
          matchesInMemoryRoutingRule(rule, where),
        ),
      create: async ({
        data,
      }: {
        data: { originUnitId: string; serviceId: string; groupId: string };
      }) => {
        const created: RoutingRuleRecord = {
          id: nextId(),
          originUnitId: data.originUnitId,
          serviceId: data.serviceId,
          groupId: data.groupId,
          createdAt: now(),
          updatedAt: now(),
        };
        rules.set(created.id, created);
        return created;
      },
    },
    formVersion: createInMemoryFormVersionDelegate(formVersions, nextId, now),
    ticket: createInMemoryTicketDelegate(tickets, nextId, now),
    changeLog: {
      create: async ({ data }: { data: InMemoryTicketChangeLog }) => {
        changeLogs.push(data);
        return data;
      },
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(prisma),
  };

  return {
    prisma,
    changeLogs,
    tickets,
    seedUnit: (unit: InMemoryTicketUnit) => units.set(unit.id, unit),
    seedService: (service: InMemoryTicketService) =>
      services.set(service.id, service),
    seedGroup: (group: InMemoryTicketGroup) => groups.set(group.id, group),
    seedUser: (user: InMemoryTicketUser) => users.set(user.id, user),
    seedFormVersion: (version: FormVersionRecord) =>
      formVersions.set(version.id, version),
  };
}
