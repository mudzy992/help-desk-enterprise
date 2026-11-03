import { ApiError, apiRequest, apiRequestValidated } from "@/services/api";
import {
  parseServiceCategoryListPage,
  parseServiceCategoryResponse,
} from "@/services/critical-api-parsers";

export type ServiceCategoryResponse = {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly parentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ServiceCategoryListPage = {
  readonly items: readonly ServiceCategoryResponse[];
  readonly total: number;
  readonly take: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export type CreateServiceCategoryInput = {
  readonly name: string;
  readonly slug: string;
  readonly sortOrder?: number;
  readonly parentId?: string | null;
};

export type UpdateServiceCategoryInput = {
  readonly name?: string;
  readonly sortOrder?: number;
  readonly parentId?: string | null;
};

export const serviceCategoryListPageSize = 100;
export const serviceCategoryListMaximumPages = 10;

export function listServiceCategoryPage(
  input: {
    readonly take?: number;
    readonly cursor?: string | null;
  } = {},
): Promise<ServiceCategoryListPage> {
  const params = new URLSearchParams();
  if (input.take !== undefined) params.set("take", String(input.take));
  if (input.cursor !== undefined && input.cursor !== null) params.set("cursor", input.cursor);
  const query = params.toString();
  return apiRequestValidated(
    query.length === 0 ? "/service-categories" : `/service-categories?${query}`,
    parseServiceCategoryListPage,
  );
}

export async function listServiceCategories(): Promise<readonly ServiceCategoryResponse[]> {
  const categories: ServiceCategoryResponse[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < serviceCategoryListMaximumPages; pageNumber += 1) {
    const page = await listServiceCategoryPage({ take: serviceCategoryListPageSize, cursor });
    categories.push(...page.items);
    if (!page.hasMore) return categories;
    if (page.nextCursor === null || seenCursors.has(page.nextCursor) || page.items.length === 0) {
      throw new ApiError(
        502,
        "INVALID_SERVICE_CATEGORY_PAGINATION",
        "Category list pagination did not advance safely",
      );
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new ApiError(
    502,
    "SERVICE_CATEGORY_RESOURCE_LIMIT_EXCEEDED",
    `Category list exceeds the ${serviceCategoryListMaximumPages * serviceCategoryListPageSize}-item client aggregation ceiling.`,
  );
}

export function getServiceCategory(serviceCategoryId: string): Promise<ServiceCategoryResponse> {
  return apiRequestValidated(
    `/service-categories/${serviceCategoryId}`,
    parseServiceCategoryResponse,
  );
}

export function createServiceCategory(
  input: CreateServiceCategoryInput,
): Promise<ServiceCategoryResponse> {
  return apiRequestValidated("/service-categories", parseServiceCategoryResponse, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateServiceCategory(
  serviceCategoryId: string,
  input: UpdateServiceCategoryInput,
  revision: number,
): Promise<ServiceCategoryResponse> {
  return apiRequestValidated(
    `/service-categories/${serviceCategoryId}`,
    parseServiceCategoryResponse,
    {
      method: "PATCH",
      headers: { "If-Match": `"v${revision}"` },
      body: JSON.stringify(input),
    },
  );
}

export function deleteServiceCategory(serviceCategoryId: string): Promise<void> {
  return apiRequest(`/service-categories/${serviceCategoryId}`, {
    method: "DELETE",
  });
}
