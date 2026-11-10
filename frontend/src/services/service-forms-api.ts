import { apiRequest } from "@/services/api";
import type { FormVersionResponse, ServiceFormSchema } from "@/services/service-catalog-api";

export function getServiceFormVersion(
  serviceId: string,
  formVersionRef: string,
): Promise<FormVersionResponse> {
  return apiRequest(`/services/${serviceId}/form/versions/${formVersionRef}`);
}

export function updateServiceFormVersion(
  serviceId: string,
  formVersionRef: string,
  schema: ServiceFormSchema,
  reason: string,
): Promise<FormVersionResponse> {
  return apiRequest(`/services/${serviceId}/form/versions/${formVersionRef}`, {
    method: "PATCH",
    body: JSON.stringify({ schema, reason }),
  });
}

export function createServiceFormVersion(
  serviceId: string,
  schema: ServiceFormSchema,
  reason: string,
): Promise<FormVersionResponse> {
  return apiRequest(`/services/${serviceId}/form/versions`, {
    method: "POST",
    body: JSON.stringify({ schema, reason }),
  });
}
