import type { FormVersionStatus } from '../../generated/prisma/enums';
import type { FormVersionRecord } from './service-forms.types';

type FormVersionWhere = {
  id?: string;
  serviceId?: string;
  status?: FormVersionStatus;
};

export function createInMemoryFormVersionDelegate(
  versions: Map<string, FormVersionRecord>,
  nextId: () => string,
  now: () => Date,
) {
  return {
    findUnique: async ({ where }: { where: { id: string } }) =>
      versions.get(where.id) ?? null,
    findFirst: async ({
      where,
      orderBy,
      select,
    }: {
      where?: { serviceId?: string; status?: FormVersionStatus };
      orderBy?: { version?: 'asc' | 'desc' };
      select?: { id?: boolean; version?: boolean };
    }) => {
      const matched = sortVersions(
        [...versions.values()].filter((item) => matchesWhere(item, where)),
        orderBy,
      );
      const first = matched[0];
      if (first === undefined) {
        return null;
      }
      if (select === undefined) {
        return first;
      }
      return {
        ...(select.id === true ? { id: first.id } : {}),
        ...(select.version === true ? { version: first.version } : {}),
      };
    },
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: { serviceId?: string; status?: FormVersionStatus };
      orderBy?: { version?: 'asc' | 'desc' };
    } = {}) =>
      sortVersions(
        [...versions.values()].filter((item) => matchesWhere(item, where)),
        orderBy,
      ),
    count: async ({ where }: { where?: { serviceId?: string } } = {}) =>
      [...versions.values()].filter((item) => matchesWhere(item, where)).length,
    create: async ({
      data,
    }: {
      data: Omit<FormVersionRecord, 'id' | 'createdAt' | 'updatedAt'> & {
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
      data: Partial<Pick<FormVersionRecord, 'schema' | 'status'>>;
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
      data: Partial<Pick<FormVersionRecord, 'status'>>;
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
  if (where?.id !== undefined && item.id !== where.id) {
    return false;
  }
  if (where?.serviceId !== undefined && item.serviceId !== where.serviceId) {
    return false;
  }
  if (where?.status !== undefined && item.status !== where.status) {
    return false;
  }
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
  if (item.serviceId !== where.serviceId) {
    return false;
  }
  if (where.status !== undefined && item.status !== where.status) {
    return false;
  }
  if (where.id?.not !== undefined && item.id === where.id.not) {
    return false;
  }
  return true;
}

function sortVersions(
  items: FormVersionRecord[],
  orderBy?: { version?: 'asc' | 'desc' },
): FormVersionRecord[] {
  const direction = orderBy?.version === 'desc' ? -1 : 1;
  return items.sort((left, right) => direction * (left.version - right.version));
}
