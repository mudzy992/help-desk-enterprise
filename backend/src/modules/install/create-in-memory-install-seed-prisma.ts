import type { InMemoryOrganizationalUnit } from '../organizational-units/create-in-memory-organizational-unit-prisma';
import { createInMemoryFormVersionDelegate } from '../service-catalog/create-in-memory-form-version-delegate';
import { createInMemoryServiceCategoryDelegate } from '../service-catalog/create-in-memory-service-category-delegate';
import { createInMemoryServiceDelegate } from '../service-catalog/create-in-memory-service-delegate';
import type { ServiceDependents } from '../service-catalog/in-memory-service-catalog-store';
import type {
  ServiceCategoryRecord,
  ServiceRecord,
} from '../service-catalog/service-catalog.types';
import type { FormVersionRecord } from '../service-catalog/service-forms.types';
import type { RoutingRuleRecord } from '../routing/routing.types';
import { createInMemoryInstallGroupLookup } from './create-in-memory-install-group-lookup';
import { createInMemoryInstallGroupMemberStore } from './create-in-memory-install-group-member-delegate';
import { createInMemoryInstallSeedGroupDelegate } from './create-in-memory-install-seed-group-delegate';
import type { InMemoryInstallSeedGroup } from './create-in-memory-install-seed-group-delegate';
import { createInMemoryInstallSlaProfileDelegate } from './create-in-memory-install-sla-profile-delegate';
import { createSeedRoutingRuleDelegate } from './create-in-memory-install-seed-routing-rule-delegate';
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
  const formVersions = new Map<string, FormVersionRecord>();
  const rules = new Map<string, RoutingRuleRecord>();
  const changeLogs: InMemoryInstallSeedChangeLog[] = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const users = createInMemoryInstallSuperAdminPrisma();
  let nextIdentifier = 1;
  let nextAuditIdentifier = 1;
  let failRoutingCreate = false;
  const now = () => new Date('2026-09-11T10:00:00.000Z');
  const nextId = () => `seed-${nextIdentifier++}`;

  const groupMembers = createInMemoryInstallGroupMemberStore({
    readUserActive: (userId) => users.readUserIsActive(userId),
    nextId,
    now,
  });
  const slaProfiles = createInMemoryInstallSlaProfileDelegate({ nextId, now });
  const baseGroupDelegate = createInMemoryInstallSeedGroupDelegate(
    groups,
    nextId,
    now,
  );
  const readGroupLookup = createInMemoryInstallGroupLookup({
    groups,
    units,
    readMembers: (groupId) =>
      groupMembers.members.filter((member) => member.groupId === groupId),
    readUser: (userId) => users.readUser(userId),
    readGroup: (groupId) => groups.get(groupId),
  });
  const prisma = {
    user: users.prisma.user,
    role: users.prisma.role,
    permission: users.prisma.permission,
    rolePermission: users.prisma.rolePermission,
    organizationalUnit: createInMemoryInstallSeedUnitDelegate(units, nextId, now),
    group: {
      ...baseGroupDelegate,
      findUnique: readGroupLookup,
    },
    groupMember: groupMembers.prisma,
    slaProfile: slaProfiles.prisma,
    serviceCategory: createInMemoryServiceCategoryDelegate(
      categories,
      nextId,
      now,
    ),
    service: createInMemoryServiceDelegate(services, dependents, nextId, now),
    formVersion: createInMemoryFormVersionDelegate(formVersions, nextId, now),
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
    auditLog: {
      findFirst: async () => auditLogs[auditLogs.length - 1] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          ...data,
          id: `audit-${nextAuditIdentifier++}`,
          createdAt: now(),
        };
        auditLogs.push(created);
        return created;
      },
    },
    $executeRaw: async (_query: TemplateStringsArray, ..._values: unknown[]) => 0,
    $transaction: async <T>(
      callback: (client: unknown) => Promise<T>,
    ): Promise<T> => {
      const snapshot = snapshotInstallSeedMaps({
        units,
        groups,
        categories,
        services,
        dependents,
        formVersions,
        rules,
        changeLogs,
      });
      const auditLogLength = auditLogs.length;
      const originalNextAuditIdentifier = nextAuditIdentifier;
      try {
        return await callback(prisma);
      } catch (error) {
        restoreInstallSeedMaps(snapshot, {
          units,
          groups,
          categories,
          services,
          dependents,
          formVersions,
          rules,
          changeLogs,
        });
        auditLogs.length = auditLogLength;
        nextAuditIdentifier = originalNextAuditIdentifier;
        throw error;
      }
    },
  };

  return {
    prisma,
    getRoleByKey: users.getRoleByKey,
    seedGroupMember: (groupId: string, userId: string) =>
      groupMembers.prisma.create({ data: { groupId, userId } }),
    listGroupMembers: (groupId: string) =>
      groupMembers.members.filter((member) => member.groupId === groupId),
    seedSlaProfile: slaProfiles.seedProfile,
    listRolePermissionKeys: users.listRolePermissionKeys,
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
    countFormVersions: () => formVersions.size,
    countRules: () => rules.size,
  };
}
