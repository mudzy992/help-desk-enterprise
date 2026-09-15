import { apiRequest } from "@/services/api";

export type ServiceCategoryResponse = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly parentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
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

export function listServiceCategories(): Promise<readonly ServiceCategoryResponse[]> {
  return apiRequest("/service-categories");
}

export function getServiceCategory(
  serviceCategoryId: string,
): Promise<ServiceCategoryResponse> {
  return apiRequest(`/service-categories/${serviceCategoryId}`);
}

export function createServiceCategory(
  input: CreateServiceCategoryInput,
): Promise<ServiceCategoryResponse> {
  return apiRequest("/service-categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateServiceCategory(
  serviceCategoryId: string,
  input: UpdateServiceCategoryInput,
): Promise<ServiceCategoryResponse> {
  return apiRequest(`/service-categories/${serviceCategoryId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteServiceCategory(serviceCategoryId: string): Promise<void> {
  return apiRequest(`/service-categories/${serviceCategoryId}`, {
    method: "DELETE",
  });
}
