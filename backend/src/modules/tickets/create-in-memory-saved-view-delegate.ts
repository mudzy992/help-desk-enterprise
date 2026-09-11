import { pickInMemoryRecord } from './in-memory-record';
import type { SavedViewRecord } from './saved-views/saved-views.types';

type SavedViewWhere = {
  readonly id?: string;
  readonly userId?: string;
  readonly name?: string;
  readonly isDefault?: boolean;
};

export function createInMemorySavedViewDelegate(
  records: Map<string, SavedViewRecord>,
  nextId: () => string,
  now: () => Date,
) {
  const matching = (where?: SavedViewWhere) =>
    [...records.values()].filter((record) => {
      if (where?.id !== undefined && record.id !== where.id) {
        return false;
      }
      if (where?.userId !== undefined && record.userId !== where.userId) {
        return false;
      }
      if (where?.name !== undefined && record.name !== where.name) {
        return false;
      }
      return where?.isDefault === undefined || record.isDefault === where.isDefault;
    });
  return {
    count: async ({ where }: { where?: SavedViewWhere } = {}) =>
      matching(where).length,
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: SavedViewWhere;
      orderBy?: { createdAt: 'asc' | 'desc' };
    } = {}) => {
      const items = matching(where);
      return orderBy?.createdAt === 'desc' ? [...items].reverse() : items;
    },
    findFirst: async ({
      where,
      select,
    }: {
      where?: SavedViewWhere;
      select?: Record<string, boolean>;
    } = {}) => pickInMemoryRecord(matching(where)[0], select),
    create: async ({
      data,
    }: {
      data: Omit<SavedViewRecord, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      };
    }) => {
      const created: SavedViewRecord = {
        ...data,
        id: data.id ?? nextId(),
        createdAt: now(),
        updatedAt: now(),
      };
      records.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<SavedViewRecord>;
    }) => {
      const current = records.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      const updated: SavedViewRecord = {
        ...current,
        ...data,
        updatedAt: now(),
      };
      records.set(updated.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = records.get(where.id);
      if (current === undefined) {
        throw new Error('NOT_FOUND');
      }
      records.delete(where.id);
      return current;
    },
  };
}
