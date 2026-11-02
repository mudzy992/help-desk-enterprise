import type { ServiceCategoryRecord } from "./service-catalog.types";
import {
  assertUniqueSlug,
  findByIdOrSlug,
  pickSelectedFields,
} from "./in-memory-service-catalog-store";

type CategoryWhere = {
  id?: string | { in?: readonly string[]; gt?: string };
  parentId?: string | null;
  sortOrder?: number | { gt?: number };
  name?: string | { gt?: string };
  OR?: readonly CategoryWhere[];
};

type CategoryOrder = {
  sortOrder?: "asc" | "desc";
  name?: "asc" | "desc";
  id?: "asc" | "desc";
};

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
    findMany: async ({
      where,
      orderBy,
      select,
      take,
    }: {
      where?: CategoryWhere;
      orderBy?: readonly CategoryOrder[];
      select?: {
        id?: boolean;
        name?: boolean;
        slug?: boolean;
        sortOrder?: boolean;
        parentId?: boolean;
      };
      take?: number;
    } = {}) => {
      const matched = [...categories.values()]
        .filter((item) => matchesCategoryWhere(item, where))
        .sort((left, right) => compareCategories(left, right, orderBy));
      const bounded = take === undefined ? matched : matched.slice(0, take);
      return select === undefined
        ? bounded
        : bounded.map((record) => pickSelectedFields(record, select));
    },
    count: async ({ where }: { where?: CategoryWhere } = {}) =>
      [...categories.values()].filter((item) =>
        matchesCategoryWhere(item, where),
      ).length,
    create: async ({
      data,
    }: {
      data: Omit<ServiceCategoryRecord, "id" | "createdAt" | "updatedAt"> & {
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

function matchesCategoryWhere(
  item: ServiceCategoryRecord,
  where?: CategoryWhere,
): boolean {
  if (where === undefined) return true;
  if (typeof where.id === "string" && item.id !== where.id) return false;
  if (typeof where.id === "object") {
    if (where.id.in !== undefined && !where.id.in.includes(item.id))
      return false;
    if (where.id.gt !== undefined && item.id <= where.id.gt) return false;
  }
  if (where.parentId !== undefined && item.parentId !== where.parentId)
    return false;
  if (typeof where.sortOrder === "number" && item.sortOrder !== where.sortOrder)
    return false;
  if (
    typeof where.sortOrder === "object" &&
    where.sortOrder.gt !== undefined &&
    item.sortOrder <= where.sortOrder.gt
  )
    return false;
  if (typeof where.name === "string" && item.name !== where.name) return false;
  if (
    typeof where.name === "object" &&
    where.name.gt !== undefined &&
    item.name <= where.name.gt
  )
    return false;
  if (
    where.OR !== undefined &&
    !where.OR.some((clause) => matchesCategoryWhere(item, clause))
  )
    return false;
  return true;
}

function compareCategories(
  left: ServiceCategoryRecord,
  right: ServiceCategoryRecord,
  orderBy: readonly CategoryOrder[] | undefined,
): number {
  const order = orderBy ?? [{ sortOrder: "asc" }, { name: "asc" }];
  for (const item of order) {
    const key =
      item.sortOrder !== undefined
        ? "sortOrder"
        : item.name !== undefined
          ? "name"
          : "id";
    const direction = item.sortOrder ?? item.name ?? item.id ?? "asc";
    const result =
      typeof left[key] === "number"
        ? (left[key] as number) - (right[key] as number)
        : String(left[key]).localeCompare(String(right[key]));
    if (result !== 0) return direction === "desc" ? -result : result;
  }
  return 0;
}
