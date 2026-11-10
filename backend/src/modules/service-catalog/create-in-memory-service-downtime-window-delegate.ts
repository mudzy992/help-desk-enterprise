import type { DowntimeWindowRecord } from "./service-availability.types";

type DateFilter = Date | { lt?: Date; lte?: Date; gt?: Date; gte?: Date };
type DowntimeWhere = {
  id?: string | { gt?: string; not?: string };
  serviceId?: string | { in: readonly string[] };
  startsAt?: DateFilter;
  endsAt?: DateFilter;
  OR?: readonly DowntimeWhere[];
};
type DowntimeOrder = {
  startsAt?: "asc" | "desc";
  id?: "asc" | "desc";
};
type DowntimeSelect = {
  id?: boolean;
  serviceId?: boolean;
  startsAt?: boolean;
  endsAt?: boolean;
  message?: boolean;
  createdAt?: boolean;
  updatedAt?: boolean;
};

export function createInMemoryServiceDowntimeWindowDelegate(
  windows: Map<string, DowntimeWindowRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: DowntimeWhere) =>
    [...windows.values()].filter((window) =>
      matchesDowntimeWhere(window, where),
    );
  const project = (record: DowntimeWindowRecord, select?: DowntimeSelect) => {
    if (select === undefined) return record;
    return {
      ...(select.id === true ? { id: record.id } : {}),
      ...(select.serviceId === true ? { serviceId: record.serviceId } : {}),
      ...(select.startsAt === true ? { startsAt: record.startsAt } : {}),
      ...(select.endsAt === true ? { endsAt: record.endsAt } : {}),
      ...(select.message === true ? { message: record.message } : {}),
      ...(select.createdAt === true ? { createdAt: record.createdAt } : {}),
      ...(select.updatedAt === true ? { updatedAt: record.updatedAt } : {}),
    };
  };
  return {
    findUnique: async ({ where }: { where: { id: string } }) =>
      windows.get(where.id) ?? null,
    findMany: async ({
      where,
      orderBy,
      take,
      select,
    }: {
      where?: DowntimeWhere;
      orderBy?: readonly DowntimeOrder[];
      take?: number;
      select?: DowntimeSelect;
    } = {}) => {
      const rows = matching(where).sort((left, right) =>
        compareDowntimeWindows(left, right, orderBy),
      );
      const bounded = take === undefined ? rows : rows.slice(0, take);
      return bounded.map((record) => project(record, select));
    },
    count: async ({ where }: { where?: DowntimeWhere } = {}) =>
      matching(where).length,
    groupBy: async ({
      by,
      where,
    }: {
      by: readonly ["serviceId"];
      where?: DowntimeWhere;
      _count?: { _all?: boolean };
    }) => {
      if (!by.includes("serviceId")) return [];
      const grouped = new Map<string, number>();
      for (const window of matching(where)) {
        grouped.set(window.serviceId, (grouped.get(window.serviceId) ?? 0) + 1);
      }
      return [...grouped].map(([serviceId, count]) => ({
        serviceId,
        _count: { _all: count },
      }));
    },
    create: async ({
      data,
    }: {
      data: Omit<DowntimeWindowRecord, "id" | "createdAt" | "updatedAt"> & {
        id?: string;
      };
    }) => {
      const created: DowntimeWindowRecord = {
        id: data.id ?? nextId(),
        serviceId: data.serviceId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        message: data.message,
        createdAt: now(),
        updatedAt: now(),
      };
      windows.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<
        Pick<DowntimeWindowRecord, "startsAt" | "endsAt" | "message">
      >;
    }) => {
      const current = windows.get(where.id);
      if (current === undefined) return null;
      const updated = { ...current, ...data, updatedAt: now() };
      windows.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = windows.get(where.id);
      windows.delete(where.id);
      return current;
    },
  };
}

function matchesDowntimeWhere(
  window: DowntimeWindowRecord,
  where?: DowntimeWhere,
): boolean {
  if (where === undefined) return true;
  if (typeof where.id === "string" && window.id !== where.id) return false;
  if (typeof where.id === "object") {
    if (where.id.gt !== undefined && window.id <= where.id.gt) return false;
    if (where.id.not !== undefined && window.id === where.id.not) return false;
  }
  if (
    typeof where.serviceId === "string" &&
    window.serviceId !== where.serviceId
  )
    return false;
  if (
    typeof where.serviceId === "object" &&
    !where.serviceId.in.includes(window.serviceId)
  )
    return false;
  if (
    where.startsAt !== undefined &&
    !matchesDate(window.startsAt, where.startsAt)
  )
    return false;
  if (where.endsAt !== undefined && !matchesDate(window.endsAt, where.endsAt))
    return false;
  if (
    where.OR !== undefined &&
    !where.OR.some((clause) => matchesDowntimeWhere(window, clause))
  )
    return false;
  return true;
}

function matchesDate(value: Date, filter: DateFilter): boolean {
  if (filter instanceof Date) return value.getTime() === filter.getTime();
  if (filter.lt !== undefined && value.getTime() >= filter.lt.getTime())
    return false;
  if (filter.lte !== undefined && value.getTime() > filter.lte.getTime())
    return false;
  if (filter.gt !== undefined && value.getTime() <= filter.gt.getTime())
    return false;
  if (filter.gte !== undefined && value.getTime() < filter.gte.getTime())
    return false;
  return true;
}

function compareDowntimeWindows(
  left: DowntimeWindowRecord,
  right: DowntimeWindowRecord,
  orderBy: readonly DowntimeOrder[] | undefined,
): number {
  const order = orderBy ?? [{ startsAt: "asc" }];
  for (const item of order) {
    if (item.startsAt !== undefined) {
      const result = left.startsAt.getTime() - right.startsAt.getTime();
      if (result !== 0) return item.startsAt === "desc" ? -result : result;
    } else if (item.id !== undefined) {
      const result = left.id.localeCompare(right.id);
      if (result !== 0) return item.id === "desc" ? -result : result;
    }
  }
  return 0;
}
