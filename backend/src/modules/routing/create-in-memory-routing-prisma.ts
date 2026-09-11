import type { ChangeLogDiffPayload } from '../change-log/change-log.types';
import {
  matchesInMemoryRoutingRule,
  pickInMemoryFields,
  type InMemoryRoutingRuleWhere,
} from './in-memory-routing-store';
import type { RoutingRuleRecord } from './routing.types';

export type InMemoryRoutingUnit = {
  readonly id: string;
  readonly parentId: string | null;
  readonly ouPath: string;
};

export type InMemoryRoutingService = {
  readonly id: string;
  readonly name: string;
  readonly lifecycle: string;
  readonly availability: string;
};

export type InMemoryRoutingGroup = {
  readonly id: string;
  readonly name: string;
};

type RoutingRuleWhere = InMemoryRoutingRuleWhere;

export type InMemoryRoutingChangeLog = {
  entityType: string;
  entityId: string;
  reason: string;
  diff: ChangeLogDiffPayload;
  actorUserId: string | null;
};

export function createInMemoryRoutingPrisma() {
  const units = new Map<string, InMemoryRoutingUnit>();
  const services = new Map<string, InMemoryRoutingService>();
  const groups = new Map<string, InMemoryRoutingGroup>();
  const rules = new Map<string, RoutingRuleRecord>();
  const changeLogs: InMemoryRoutingChangeLog[] = [];
  let nextIdentifier = 1;
  const now = () => new Date('2026-09-11T08:00:00.000Z');
  const nextId = () => `routing-${nextIdentifier++}`;

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
        orderBy?: unknown;
      } = {}) =>
        [...units.values()]
          .filter((unit) =>
            where?.id === undefined ? true : where.id.in.includes(unit.id),
          )
          .sort((left, right) => left.ouPath.localeCompare(right.ouPath))
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
        orderBy?: unknown;
      } = {}) =>
        [...services.values()]
          .filter((service) =>
            where?.id === undefined ? true : where.id.in.includes(service.id),
          )
          .sort((left, right) => left.name.localeCompare(right.name))
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
    routingRule: createRoutingRuleDelegate(rules, nextId, now),
    changeLog: {
      create: async ({ data }: { data: InMemoryRoutingChangeLog }) => {
        changeLogs.push(data);
        return data;
      },
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(prisma),
  };

  return {
    prisma,
    seedUnit: (unit: InMemoryRoutingUnit) => units.set(unit.id, unit),
    seedService: (service: InMemoryRoutingService) =>
      services.set(service.id, service),
    seedGroup: (group: InMemoryRoutingGroup) => groups.set(group.id, group),
    seedRule: (rule: RoutingRuleRecord) => rules.set(rule.id, rule),
    getService: (id: string) => services.get(id),
    changeLogs,
  };
}

function createRoutingRuleDelegate(
  rules: Map<string, RoutingRuleRecord>,
  nextId: () => string,
  now: () => Date,
) {
  return {
    findMany: async ({
      where,
    }: {
      where?: RoutingRuleWhere;
    } = {}) =>
      [...rules.values()]
        .filter((rule) => matchesInMemoryRoutingRule(rule, where))
        .sort((left, right) =>
          left.serviceId === right.serviceId
            ? left.originUnitId.localeCompare(right.originUnitId)
            : left.serviceId.localeCompare(right.serviceId),
        ),
    count: async ({ where }: { where: { serviceId: string } }) =>
      [...rules.values()].filter((rule) => rule.serviceId === where.serviceId)
        .length,
    create: async ({
      data,
    }: {
      data: { originUnitId: string; serviceId: string; groupId: string };
    }) => {
      for (const existing of rules.values()) {
        if (
          existing.originUnitId === data.originUnitId &&
          existing.serviceId === data.serviceId
        ) {
          throw {
            code: 'P2002',
            meta: { target: ['originUnitId', 'serviceId'] },
          };
        }
      }
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
  };
}
