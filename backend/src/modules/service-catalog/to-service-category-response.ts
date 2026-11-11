import type {
  ServiceCategoryRecord,
  ServiceCategoryResponse,
} from './service-catalog.types';

export function toServiceCategoryResponse(
  record: ServiceCategoryRecord,
): ServiceCategoryResponse {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    sortOrder: record.sortOrder,
    parentId: record.parentId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
