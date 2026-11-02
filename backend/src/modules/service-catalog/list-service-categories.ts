import { PrismaService } from "../../common/prisma/prisma.service";
import {
  serviceCategoryListDefaultTake,
  serviceCategoryListMaximumResponseBytes,
  serviceCategoryListMaximumTake,
} from "./service-catalog.constants";
import {
  decodeServiceCategoryListCursor,
  encodeServiceCategoryListCursor,
} from "./service-category-list-cursor";
import { ServiceCatalogError } from "./service-catalog.error";
import type {
  ServiceCategoryListInput,
  ServiceCategoryListPage,
} from "./service-catalog.types";
import { toServiceCategoryResponse } from "./to-service-category-response";

export async function listServiceCategories(
  prisma: PrismaService,
  input: ServiceCategoryListInput = {},
): Promise<ServiceCategoryListPage> {
  const take = Math.min(
    serviceCategoryListMaximumTake,
    Math.max(1, input.take ?? serviceCategoryListDefaultTake),
  );
  const cursor = decodeServiceCategoryListCursor(input.cursor);
  const cursorWhere =
    cursor === null
      ? {}
      : {
          OR: [
            { sortOrder: { gt: cursor.sortOrder } },
            { sortOrder: cursor.sortOrder, name: { gt: cursor.name } },
            {
              sortOrder: cursor.sortOrder,
              name: cursor.name,
              id: { gt: cursor.id },
            },
          ],
        };
  const [total, records] = await Promise.all([
    prisma.serviceCategory.count({ where: {} }),
    prisma.serviceCategory.findMany({
      where: cursorWhere,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      take: take + 1,
    }),
  ]);
  const hasMore = records.length > take;
  const pageRecords = hasMore ? records.slice(0, take) : records;
  const items = pageRecords.map(toServiceCategoryResponse);
  const last = pageRecords.at(-1);
  const page: ServiceCategoryListPage = {
    items,
    total,
    take,
    cursor: input.cursor ?? null,
    nextCursor:
      hasMore && last !== undefined
        ? encodeServiceCategoryListCursor({
            sortOrder: last.sortOrder,
            name: last.name,
            id: last.id,
          })
        : null,
    hasMore,
  };
  if (
    Buffer.byteLength(JSON.stringify(page), "utf8") >
    serviceCategoryListMaximumResponseBytes
  ) {
    throw new ServiceCatalogError("CATALOG_RESOURCE_LIMIT_EXCEEDED");
  }
  return page;
}
