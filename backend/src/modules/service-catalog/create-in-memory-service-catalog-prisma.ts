import { createInMemoryServiceCategoryDelegate } from './create-in-memory-service-category-delegate';
import { createInMemoryServiceDelegate } from './create-in-memory-service-delegate';
import {
  emptyServiceDependents,
  type ServiceDependents,
} from './in-memory-service-catalog-store';
import type { ServiceCategoryRecord, ServiceRecord } from './service-catalog.types';

export type InMemoryServiceCategory = ServiceCategoryRecord;
export type InMemoryService = ServiceRecord;

export type InMemoryServiceCatalogChangeLog = {
  entityType: string;
  entityId: string;
  reason: string;
  diff: object;
  actorUserId: string | null;
};

export function createInMemoryServiceCatalogPrisma(): {
  prisma: {
    serviceCategory: Record<string, unknown>;
    service: Record<string, unknown>;
    policyPack: Record<string, unknown>;
    changeLog: Record<string, unknown>;
    $transaction: (callback: (client: unknown) => Promise<unknown>) => Promise<unknown>;
  };
  seedCategory: (category: InMemoryServiceCategory) => void;
  seedService: (service: InMemoryService) => void;
  seedPolicyPack: (id: string) => void;
  seedServiceDependents: (serviceId: string, dependents: Partial<ServiceDependents>) => void;
  changeLogs: InMemoryServiceCatalogChangeLog[];
} {
  const categories = new Map<string, InMemoryServiceCategory>();
  const services = new Map<string, InMemoryService>();
  const policyPacks = new Set<string>();
  const dependents = new Map<string, ServiceDependents>();
  const changeLogs: InMemoryServiceCatalogChangeLog[] = [];
  let nextIdentifier = 1;
  const now = () => new Date('2026-09-10T10:00:00.000Z');
  const nextId = () => `record-${nextIdentifier++}`;

  const prisma = {
    serviceCategory: createInMemoryServiceCategoryDelegate(categories, nextId, now),
    service: createInMemoryServiceDelegate(services, dependents, nextId, now),
    policyPack: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        policyPacks.has(where.id) ? { id: where.id } : null,
    },
    changeLog: {
      create: async ({ data }: { data: InMemoryServiceCatalogChangeLog }) => {
        changeLogs.push(data);
        return data;
      },
    },
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback(prisma),
  };

  return {
    prisma,
    seedCategory: (category) => {
      categories.set(category.id, category);
    },
    seedService: (service) => {
      services.set(service.id, service);
    },
    seedPolicyPack: (id) => {
      policyPacks.add(id);
    },
    seedServiceDependents: (serviceId, counts) => {
      dependents.set(serviceId, {
        ...emptyServiceDependents(),
        ...counts,
      });
    },
    changeLogs,
  };
}
