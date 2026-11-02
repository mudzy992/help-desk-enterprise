import type { FormVersionStatus } from "../../generated/prisma/enums";
import type { FormVersionRecord } from "./service-forms.types";

type FormVersionWhere = {
  id?: string | { lt?: string; gt?: string };
  serviceId?: string | { in: readonly string[] };
  status?: FormVersionStatus;
  version?: number | { lt?: number };
  OR?: readonly FormVersionWhere[];
};

type FormVersionOrder = {
  serviceId?: "asc" | "desc";
  version?: "asc" | "desc";
  id?: "asc" | "desc";
};
type FormVersionSelect = {
  id?: boolean;
  serviceId?: boolean;
  version?: boolean;
  schema?: boolean;
  status?: boolean;
  createdAt?: boolean;
  updatedAt?: boolean;
  _count?: { select?: { tickets?: boolean } };
};

export function createInMemoryFormVersionDelegate(
  versions: Map<string, FormVersionRecord>,
  nextId: () => string,
  now: () => Date,
  countTicketsForFormVersion: (formVersionId: string) => number = () => 0,
) {
  const project = (record: FormVersionRecord, select?: FormVersionSelect) => {
    if (select === undefined) return record;
    return {
      ...(select.id === true ? { id: record.id } : {}),
      ...(select.serviceId === true ? { serviceId: record.serviceId } : {}),
      ...(select.version === true ? { version: record.version } : {}),
      ...(select.schema === true ? { schema: record.schema } : {}),
      ...(select.status === true ? { status: record.status } : {}),
      ...(select.createdAt === true ? { createdAt: record.createdAt } : {}),
      ...(select.updatedAt === true ? { updatedAt: record.updatedAt } : {}),
      ...(select._count?.select?.tickets === true
        ? { _count: { tickets: countTicketsForFormVersion(record.id) } }
        : {}),
    };
  };
  const matching = (where?: FormVersionWhere) =>
    [...versions.values()].filter((item) => matchesWhere(item, where));
  return {
    findUnique: async ({ where }: { where: { id: string } }) =>
      versions.get(where.id) ?? null,
    findFirst: async ({
      where,
      orderBy,
      select,
    }: {
      where?: FormVersionWhere;
      orderBy?: FormVersionOrder | readonly FormVersionOrder[];
      select?: FormVersionSelect;
    }) => {
      const first = sortVersions(matching(where), orderBy)[0];
      return first === undefined ? null : project(first, select);
    },
    findMany: async ({
      where,
      orderBy,
      select,
      take,
    }: {
      where?: FormVersionWhere;
      orderBy?: FormVersionOrder | readonly FormVersionOrder[];
      select?: FormVersionSelect;
      take?: number;
    } = {}) => {
      const rows = sortVersions(matching(where), orderBy);
      const bounded = take === undefined ? rows : rows.slice(0, take);
      return bounded.map((record) => project(record, select));
    },
    count: async ({ where }: { where?: FormVersionWhere } = {}) =>
      matching(where).length,
    create: async ({
      data,
    }: {
      data: Omit<FormVersionRecord, "id" | "createdAt" | "updatedAt"> & {
        id?: string;
      };
    }) => {
      const created: FormVersionRecord = {
        id: data.id ?? nextId(),
        serviceId: data.serviceId,
        version: data.version,
        schema: data.schema,
        status: data.status,
        createdAt: now(),
        updatedAt: now(),
      };
      versions.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Pick<FormVersionRecord, "schema" | "status">>;
    }) => {
      const current = versions.get(where.id);
      if (current === undefined) {
        return null;
      }
      const updated = { ...current, ...data, updatedAt: now() };
      versions.set(where.id, updated);
      return updated;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        serviceId: string;
        status?: FormVersionStatus;
        id?: { not: string };
      };
      data: Partial<Pick<FormVersionRecord, "status">>;
    }) => {
      let count = 0;
      for (const current of versions.values()) {
        if (!matchesUpdateMany(current, where)) {
          continue;
        }
        versions.set(current.id, { ...current, ...data, updatedAt: now() });
        count += 1;
      }
      return { count };
    },
  };
}

function matchesWhere(
  item: FormVersionRecord,
  where?: FormVersionWhere,
): boolean {
  if (where === undefined) return true;
  if (typeof where.id === "string" && item.id !== where.id) return false;
  if (typeof where.id === "object") {
    if (where.id.lt !== undefined && item.id >= where.id.lt) return false;
    if (where.id.gt !== undefined && item.id <= where.id.gt) return false;
  }
  if (typeof where.serviceId === "string" && item.serviceId !== where.serviceId)
    return false;
  if (
    typeof where.serviceId === "object" &&
    !where.serviceId.in.includes(item.serviceId)
  )
    return false;
  if (where.status !== undefined && item.status !== where.status) return false;
  if (typeof where.version === "number" && item.version !== where.version)
    return false;
  if (
    typeof where.version === "object" &&
    where.version.lt !== undefined &&
    item.version >= where.version.lt
  )
    return false;
  if (
    where.OR !== undefined &&
    !where.OR.some((clause) => matchesWhere(item, clause))
  )
    return false;
  return true;
}

function matchesUpdateMany(
  item: FormVersionRecord,
  where: {
    serviceId: string;
    status?: FormVersionStatus;
    id?: { not: string };
  },
): boolean {
  if (item.serviceId !== where.serviceId) return false;
  if (where.status !== undefined && item.status !== where.status) return false;
  if (where.id?.not !== undefined && item.id === where.id.not) return false;
  return true;
}

function sortVersions(
  items: FormVersionRecord[],
  orderBy?: FormVersionOrder | readonly FormVersionOrder[],
): FormVersionRecord[] {
  const order = Array.isArray(orderBy)
    ? orderBy
    : orderBy === undefined
      ? [{ version: "asc" }]
      : [orderBy];
  return items.sort((left, right) => {
    for (const item of order) {
      const key =
        item.serviceId !== undefined
          ? "serviceId"
          : item.version !== undefined
            ? "version"
            : "id";
      const direction = item.serviceId ?? item.version ?? item.id ?? "asc";
      const comparison =
        key === "version"
          ? left.version - right.version
          : key === "serviceId"
            ? left.serviceId.localeCompare(right.serviceId)
            : left.id.localeCompare(right.id);
      if (comparison !== 0)
        return direction === "desc" ? -comparison : comparison;
    }
    return 0;
  });
}
