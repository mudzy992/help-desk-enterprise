import type { DowntimeWindowRecord } from './service-availability.types';

export function createInMemoryServiceDowntimeWindowDelegate(
  windows: Map<string, DowntimeWindowRecord>,
  nextId: () => string,
  now: () => Date,
) {
  return {
    findUnique: async ({ where }: { where: { id: string } }) =>
      windows.get(where.id) ?? null,
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: { serviceId?: string | { in: readonly string[] } };
      orderBy?: readonly { startsAt?: 'asc' | 'desc' }[];
    } = {}) => {
      const matched = [...windows.values()].filter((window) =>
        matchesDowntimeWhere(window, where),
      );
      const direction = orderBy?.[0]?.startsAt === 'desc' ? -1 : 1;
      return matched.sort(
        (left, right) =>
          direction * (left.startsAt.getTime() - right.startsAt.getTime()),
      );
    },
    create: async ({
      data,
    }: {
      data: Omit<DowntimeWindowRecord, 'id' | 'createdAt' | 'updatedAt'> & {
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
      data: Partial<Pick<DowntimeWindowRecord, 'startsAt' | 'endsAt' | 'message'>>;
    }) => {
      const current = windows.get(where.id);
      if (current === undefined) {
        return null;
      }
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
  where?: { serviceId?: string | { in: readonly string[] } },
): boolean {
  if (where?.serviceId === undefined) {
    return true;
  }
  if (typeof where.serviceId === 'string') {
    return window.serviceId === where.serviceId;
  }
  return where.serviceId.in.includes(window.serviceId);
}
