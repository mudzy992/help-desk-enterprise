import type { InMemoryOrganizationalUnit } from '../organizational-units/create-in-memory-organizational-unit-prisma';
import { createInMemoryServiceCategoryDelegate } from '../service-catalog/create-in-memory-service-category-delegate';
import { createInMemoryServiceDelegate } from '../service-catalog/create-in-memory-service-delegate';
import type { ServiceDependents } from '../service-catalog/in-memory-service-catalog-store';
import type {
  ServiceCategoryRecord,
  ServiceRecord,
} from '../service-catalog/service-catalog.types';
import {
  matchesInMemoryRoutingRule,
  type InMemoryRoutingRuleWhere,
} from '../routing/in-memory-routing-store';
import type { RoutingRuleRecord } from '../routing/routing.types';
import { createInMemoryInstallSeedGroupDelegate } from './create-in-memory-install-seed-group-delegate';
import type { InMemoryInstallSeedGroup } from './create-in-memory-install-seed-group-delegate';
import { createInMemoryInstallSeedUnitDelegate } from './create-in-memory-install-seed-unit-delegate';
import { createInMemoryInstallSuperAdminPrisma } from './create-in-memory-install-super-admin-prisma';
import {
  restoreInstallSeedMaps,
  snapshotInstallSeedMaps,
  type InMemoryInstallSeedChangeLog,
} from './snapshot-in-memory-install-seed-maps';

export function createInMemoryInstallSeedPrisma() {
  const units = new Map<string, InMemoryOrganizationalUnit>();
  const groups = new Map<string, InMemoryInstallSeedGroup>();
  const categories = new Map<string, ServiceCategoryRecord>();
  const services = new Map<string, ServiceRecord>();
  const dependents = new Map<string, ServiceDependents>();
  const rules = new Map<string, RoutingRuleRecord>();
  const changeLogs: InMemoryInstallSeedChangeLog[] = [];
  const users = createInMemoryInstallSuperAdminPrisma();
  let nextIdentifier = 1;
  let failRoutingCreate = false;
  const now = () => new Date('2026-09-11T10:00:00.000Z');
  const nextId = () => `seed-${nextIdentifier++}`;

  const prisma = {
    user: users.prisma.user,
    role: users.prisma.role,
    organizationalUnit: createInMemoryInstallSeedUnitDelegate(units, nextId, now),
    group: createInMemoryInstallSeedGroupDelegate(groups, nextId, now),
    serviceCategory: createInMemoryServiceCategoryDelegate(
      categories,
      nextId,
      now,
    ),
    service: createInMemoryServiceDelegate(services, dependents, nextId, now),
    routingRule: createSeedRoutingRuleDelegate(rules, nextId, now, () => {
      if (!failRoutingCreate) {
        return false;
      }
      failRoutingCreate = false;
      return true;
    }),
    changeLog: {
      create: async ({ data }: { data: InMemoryInstallSeedChangeLog }) => {
        changeLogs.push(data);
        return data;
      },
    },
    $transaction: async <T>(
      callback: (client: unknown) => Promise<T>,
    ): Promise<T> => {
      const snapshot = snapshotInstallSeedMaps({
        units,
        groups,
        categories,
        services,
        dependents,
        rules,
        changeLogs,
      });
      try {
        return await callback(prisma);
      } catch (error) {
        restoreInstallSeedMaps(snapshot, {
          units,
          groups,
          categories,
          services,
          dependents,
          rules,
          changeLogs,
        });
        throw error;
      }
    },
  };

  return {
    prisma,
    seedUser: users.seedUser,
    seedUnit: (unit: InMemoryOrganizationalUnit) => units.set(unit.id, unit),
    seedGroup: (group: InMemoryInstallSeedGroup) => groups.set(group.id, group),
    seedCategory: (category: ServiceCategoryRecord) =>
      categories.set(category.id, category),
    seedService: (service: ServiceRecord) => services.set(service.id, service),
    seedRule: (rule: RoutingRuleRecord) => rules.set(rule.id, rule),
    failNextRoutingCreate: () => {
      failRoutingCreate = true;
    },
    changeLogs,
    countUnits: () => units.size,
    countGroups: () => groups.size,
    countServices: () => services.size,
    countRules: () => rules.size,
  };
}

function createSeedRoutingRuleDelegate(
  rules: Map<string, RoutingRuleRecord>,
  nextId: () => string,
  now: () => Date,
  shouldFail: () => boolean,
) {
  return {
    findMany: async ({
      where,
    }: {
      where?: InMemoryRoutingRuleWhere;
    } = {}) =>
      [...rules.values()]
        .filter((rule) => matchesInMemoryRoutingRule(rule, where))
        .sort((left, right) => left.serviceId.localeCompare(right.serviceId)),
    create: async ({
      data,
    }: {
      data: { originUnitId: string; serviceId: string; groupId: string };
    }) => {
      if (shouldFail()) {
        throw new Error('forced-routing-create-failure');
      }
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
