import type { ServiceCategoryRecord } from './service-catalog.types';
import {
  assertUniqueSlug,
  findByIdOrSlug,
  pickSelectedFields,
} from './in-memory-service-catalog-store';

export function createInMemoryServiceCategoryDelegate(
  categories: Map<string, ServiceCategoryRecord>,
  nextId: () => string,
  now: () => Date,
) {
  return {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id?: string; slug?: string };
      select?: { id?: boolean; parentId?: boolean };
    }) => {
      const record = findByIdOrSlug(categories, where);
      if (record === null || select === undefined) {
        return record;
      }
      return pickSelectedFields(record, select);
    },
    findMany: async () =>
      [...categories.values()].sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
      ),
    count: async ({ where }: { where: { parentId: string } }) =>
      [...categories.values()].filter((item) => item.parentId === where.parentId)
        .length,
    create: async ({
      data,
    }: {
      data: Omit<ServiceCategoryRecord, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      };
    }) => {
      assertUniqueSlug(categories, data.slug);
      const created: ServiceCategoryRecord = {
        id: data.id ?? nextId(),
        name: data.name,
        slug: data.slug,
        sortOrder: data.sortOrder,
        parentId: data.parentId,
        createdAt: now(),
        updatedAt: now(),
      };
      categories.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ServiceCategoryRecord>;
    }) => {
      const current = categories.get(where.id);
      if (current === undefined) {
        return null;
      }
      const updated = { ...current, ...data, updatedAt: now() };
      categories.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const current = categories.get(where.id);
      categories.delete(where.id);
      return current;
    },
  };
}
