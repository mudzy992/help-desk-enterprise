import type {
  AutoAssignStrategy,
  DataClassification,
  ServiceAvailability,
  ServiceLifecycle,
} from "../../generated/prisma/enums";
import type { ServiceRecord } from "./service-catalog.types";
import {
  assertUniqueSlug,
  emptyServiceDependents,
  findByIdOrSlug,
  pickSelectedFields,
  type ServiceDependents,
} from "./in-memory-service-catalog-store";

export type InMemoryWhere = {
  lifecycle?: ServiceLifecycle | { in: readonly ServiceLifecycle[] };
  categoryId?: string;
  id?: string | { gt?: string };
  name?: string | { contains?: string; gt?: string; mode?: "insensitive" };
  slug?: string | { contains?: string; mode?: "insensitive" };
  OR?: readonly InMemoryWhere[];
  AND?: readonly InMemoryWhere[];
  routingRules?: { some: { originUnitId: string } };
};

type InMemoryOrder = { name?: "asc" | "desc"; id?: "asc" | "desc" };

export function createInMemoryServiceDelegate(
  services: Map<string, ServiceRecord>,
  dependents: Map<string, ServiceDependents>,
  nextId: () => string,
  now: () => Date,
  downtimeWindows: Map<string, { serviceId: string }> = new Map(),
  formVersions: Map<string, { serviceId: string }> = new Map(),
  tickets: Map<string, { serviceId: string }> = new Map(),
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
        const seeded = dependents.get(record.id) ?? emptyServiceDependents();
        return {
          ...record,
          _count: {
            tickets: seeded.tickets + countByServiceId(tickets, record.id),
            formVersions:
              seeded.formVersions + countByServiceId(formVersions, record.id),
            routingRules: seeded.routingRules,
            userRoles: seeded.userRoles,
          },
        };
      }
      if (select === undefined) {
        return record;
      }
      return pickSelectedFields(record, select);
    },
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where?: InMemoryWhere;
      orderBy?: readonly InMemoryOrder[];
      take?: number;
    } = {}) => {
      const sorted = [...services.values()]
        .filter((item) => matchesServiceWhere(item, where))
        .sort((left, right) => compareServices(left, right, orderBy));
      return take === undefined ? sorted : sorted.slice(0, take);
    },
    count: async ({ where }: { where?: InMemoryWhere } = {}) =>
      [...services.values()].filter((item) => matchesServiceWhere(item, where))
        .length,
    create: async ({
      data,
    }: {
      data: Omit<
        ServiceRecord,
        "id" | "createdAt" | "updatedAt" | "availability" | "slaProfileId"
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
        availability: data.availability ?? "OPERATIONAL",
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

function countByServiceId(
  records: Map<string, { serviceId: string }>,
  serviceId: string,
): number {
  return [...records.values()].filter((item) => item.serviceId === serviceId)
    .length;
}

function matchesServiceWhere(
  item: ServiceRecord,
  where?: InMemoryWhere,
): boolean {
  if (where === undefined) return true;
  const lifecycle = where.lifecycle;
  if (typeof lifecycle === "string" && item.lifecycle !== lifecycle)
    return false;
  if (
    lifecycle !== undefined &&
    typeof lifecycle === "object" &&
    !lifecycle.in.includes(item.lifecycle)
  )
    return false;
  if (where.categoryId !== undefined && item.categoryId !== where.categoryId)
    return false;
  if (where.id !== undefined && !matchesStringFilter(item.id, where.id))
    return false;
  if (where.name !== undefined && !matchesStringFilter(item.name, where.name))
    return false;
  if (where.slug !== undefined && !matchesStringFilter(item.slug, where.slug))
    return false;
  if (where.routingRules !== undefined) return false;
  if (
    where.OR !== undefined &&
    !where.OR.some((clause) => matchesServiceWhere(item, clause))
  )
    return false;
  if (
    where.AND !== undefined &&
    !where.AND.every((clause) => matchesServiceWhere(item, clause))
  )
    return false;
  return true;
}

function matchesStringFilter(
  value: string,
  filter: string | { contains?: string; gt?: string; mode?: "insensitive" },
): boolean {
  if (typeof filter === "string") return value === filter;
  if (filter.gt !== undefined && value <= filter.gt) return false;
  if (filter.contains !== undefined) {
    const candidate =
      filter.mode === "insensitive" ? value.toLocaleLowerCase() : value;
    const search =
      filter.mode === "insensitive"
        ? filter.contains.toLocaleLowerCase()
        : filter.contains;
    if (!candidate.includes(search)) return false;
  }
  return true;
}

function compareServices(
  left: ServiceRecord,
  right: ServiceRecord,
  orderBy: readonly InMemoryOrder[] | undefined,
): number {
  const order = orderBy ?? [{ name: "asc" }];
  for (const item of order) {
    const key = item.name !== undefined ? "name" : "id";
    const direction = item.name ?? item.id ?? "asc";
    const result = left[key].localeCompare(right[key]);
    if (result !== 0) return direction === "desc" ? -result : result;
  }
  return 0;
}
