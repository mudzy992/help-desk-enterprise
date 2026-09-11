import type { CloseCodeRecord } from './close-codes/close-codes.types';

export function createInMemoryCloseCodeDelegate(
  codes: Map<string, CloseCodeRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const list = (where?: {
    id?: string | { in: readonly string[] };
    key?: string;
    serviceId?: string | null;
    isActive?: boolean;
  }) =>
    [...codes.values()].filter((record) => matchesCloseCode(record, where));

  return {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; key?: string };
    }) => {
      if (where.id !== undefined) {
        return codes.get(where.id) ?? null;
      }
      if (where.key !== undefined) {
        return list({ key: where.key })[0] ?? null;
      }
      return null;
    },
    findFirst: async ({
      where,
    }: {
      where?: {
        key?: string;
        serviceId?: string | null;
        isActive?: boolean;
      };
    } = {}) => list(where)[0] ?? null,
    findMany: async ({
      where,
    }: {
      where?: {
        id?: { in: readonly string[] };
        key?: string;
        serviceId?: string | null;
        isActive?: boolean;
      };
    } = {}) => list(where),
    create: async ({
      data,
    }: {
      data: {
        key: string;
        name: string;
        serviceId?: string | null;
        isActive?: boolean;
      };
    }) => {
      const created: CloseCodeRecord = {
        id: nextId(),
        key: data.key,
        name: data.name,
        serviceId: data.serviceId ?? null,
        isActive: data.isActive ?? true,
        createdAt: now(),
        updatedAt: now(),
      };
      codes.set(created.id, created);
      return created;
    },
  };
}

function matchesCloseCode(
  record: CloseCodeRecord,
  where?: {
    id?: string | { in: readonly string[] };
    key?: string;
    serviceId?: string | null;
    isActive?: boolean;
  },
): boolean {
  if (where === undefined) {
    return true;
  }
  if (typeof where.id === 'string' && record.id !== where.id) {
    return false;
  }
  if (
    where.id !== undefined &&
    typeof where.id !== 'string' &&
    !where.id.in.includes(record.id)
  ) {
    return false;
  }
  if (where.key !== undefined && record.key !== where.key) {
    return false;
  }
  if (where.serviceId !== undefined && record.serviceId !== where.serviceId) {
    return false;
  }
  if (where.isActive !== undefined && record.isActive !== where.isActive) {
    return false;
  }
  return true;
}
