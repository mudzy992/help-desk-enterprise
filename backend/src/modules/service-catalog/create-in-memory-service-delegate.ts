import type {
  AutoAssignStrategy,
  DataClassification,
  ServiceAvailability,
  ServiceLifecycle,
} from '../../generated/prisma/enums';
import type { ServiceRecord } from './service-catalog.types';
import {
  assertUniqueSlug,
  emptyServiceDependents,
  findByIdOrSlug,
  pickSelectedFields,
  type ServiceDependents,
} from './in-memory-service-catalog-store';

export function createInMemoryServiceDelegate(
  services: Map<string, ServiceRecord>,
  dependents: Map<string, ServiceDependents>,
  nextId: () => string,
  now: () => Date,
  downtimeWindows: Map<string, { serviceId: string }> = new Map(),
) {
  return {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id?: string; slug?: string };
      select?: { id?: boolean; _count?: { select: ServiceDependents } };
    }) => {
      const record = findByIdOrSlug(services, where);
      if (record === null) {
        return null;
      }
      if (select?._count !== undefined) {
        return {
          ...record,
          _count: dependents.get(record.id) ?? emptyServiceDependents(),
        };
      }
      if (select === undefined) {
        return record;
      }
      return pickSelectedFields(record, select);
    },
    findMany: async ({
      where,
    }: {
      where?: { lifecycle?: ServiceLifecycle; categoryId?: string };
    } = {}) =>
      [...services.values()]
        .filter((item) => matchesServiceWhere(item, where))
        .sort((left, right) => left.name.localeCompare(right.name)),
    count: async ({ where }: { where: { categoryId: string } }) =>
      [...services.values()].filter((item) => item.categoryId === where.categoryId)
        .length,
    create: async ({
      data,
    }: {
      data: Omit<
        ServiceRecord,
        'id' | 'createdAt' | 'updatedAt' | 'availability' | 'slaProfileId'
      > & {
        id?: string;
        availability?: ServiceAvailability;
        slaProfileId?: string | null;
        classification: DataClassification;
        autoAssignStrategy: AutoAssignStrategy;
      };
    }) => {
      assertUniqueSlug(services, data.slug);
      const created: ServiceRecord = {
        id: data.id ?? nextId(),
        name: data.name,
        slug: data.slug,
        categoryId: data.categoryId,
        lifecycle: data.lifecycle,
        availability: data.availability ?? 'OPERATIONAL',
        classification: data.classification,
        requiresApproval: data.requiresApproval,
        isConfidentialDefault: data.isConfidentialDefault,
        autoAssignStrategy: data.autoAssignStrategy,
        slaProfileId: data.slaProfileId ?? null,
        policyPackId: data.policyPackId,
        createdAt: now(),
        updatedAt: now(),
      };
      services.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ServiceRecord>;
    }) => {
      const current = services.get(where.id);
      if (current === undefined) {
        return null;
      }
      const updated = { ...current, ...data, updatedAt: now() };
      services.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = services.get(where.id);
      services.delete(where.id);
      for (const [windowId, window] of downtimeWindows) {
        if (window.serviceId === where.id) {
          downtimeWindows.delete(windowId);
        }
      }
      return current;
    },
  };
}

function matchesServiceWhere(
  item: ServiceRecord,
  where?: { lifecycle?: ServiceLifecycle; categoryId?: string },
): boolean {
  if (where?.lifecycle !== undefined && item.lifecycle !== where.lifecycle) {
    return false;
  }
  if (where?.categoryId !== undefined && item.categoryId !== where.categoryId) {
    return false;
  }
  return true;
}
