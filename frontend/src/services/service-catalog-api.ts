import { apiRequest } from "@/services/api";
import {
  listServiceCategories as listServiceCategoriesFromApi,
  type ServiceCategoryResponse as ServiceCategoryApiResponse,
} from "@/services/service-categories-api";

export type ServiceCategoryResponse = ServiceCategoryApiResponse;

export const listServiceCategories = listServiceCategoriesFromApi;

export type ServiceLifecycle = "DRAFT" | "ACTIVE" | "DEPRECATED";
export type ServiceAvailability =
  | "OPERATIONAL"
  | "DEGRADED"
  | "DOWN"
  | "MAINTENANCE";

export type ServiceDowntimeWindowSummary = {
  readonly message: string;
  readonly startsAt: string;
  readonly endsAt: string;
};

export type ServiceRuntimeAvailability = {
  readonly isCurrentlyAvailable: boolean;
  readonly isCurrentlyUnavailable: boolean;
  readonly hasActiveDowntime: boolean;
  readonly hasUpcomingDowntime: boolean;
  readonly ticketCreationAllowed: true;
  readonly showStatusInTicketCreate: boolean;
  readonly activeDowntimeWindow: ServiceDowntimeWindowSummary | null;
  readonly upcomingDowntimeWindow: ServiceDowntimeWindowSummary | null;
};

export type ServiceResponse = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly lifecycle: ServiceLifecycle;
  readonly offeredToRequesters: boolean;
  readonly availability: ServiceAvailability;
  readonly runtimeAvailability: ServiceRuntimeAvailability;
  readonly classification: string;
  readonly requiresApproval: boolean;
  readonly openTicketCount: number;
};

export type CreateServiceInput = {
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly requiresApproval?: boolean;
};

export type UpdateServiceInput = {
  readonly name?: string;
  readonly categoryId?: string;
  readonly requiresApproval?: boolean;
};

export type ServiceFormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "date"
  | "datetime"
  | "email";

export type ServiceFormField = {
  readonly id: string;
  readonly label: string;
  readonly type: ServiceFormFieldType;
  readonly required: boolean;
  readonly order: number;
  readonly validation?: {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: string;
    readonly min?: number;
    readonly max?: number;
    readonly integer?: boolean;
    readonly minItems?: number;
    readonly maxItems?: number;
    readonly options?: readonly { readonly value: string; readonly label: string }[];
  };
  readonly config?: {
    readonly placeholder?: string;
    readonly helpText?: string;
  };
};

export type ServiceFormSchema = {
  readonly schemaVersion: 1;
  readonly fields: readonly ServiceFormField[];
};

export type FormVersionStatus = "DRAFT" | "ACTIVE" | "RETIRED";

export type FormVersionResponse = {
  readonly formVersionRef: string;
  readonly serviceId: string;
  readonly version: number;
  readonly status: FormVersionStatus;
  readonly schema: ServiceFormSchema;
  readonly isImmutable?: boolean;
};

export type ServiceFormResponse = {
  readonly serviceId: string;
  readonly activeFormVersionRef: string | null;
  readonly versions: readonly FormVersionResponse[];
};

export type ServiceTicketCreationEligibility = {
  readonly allowed: true;
  readonly blockedByAvailability: false;
  readonly serviceId: string;
  readonly runtimeAvailability: ServiceRuntimeAvailability;
};

export function listOfferedServices(): Promise<readonly ServiceResponse[]> {
  return apiRequest("/services?offeredOnly=true");
}

export function listServices(): Promise<readonly ServiceResponse[]> {
  return apiRequest("/services");
}

export function createService(input: CreateServiceInput): Promise<ServiceResponse> {
  return apiRequest("/services", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateService(
  serviceId: string,
  input: UpdateServiceInput,
): Promise<ServiceResponse> {
  return apiRequest(`/services/${serviceId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function transitionServiceLifecycle(
  serviceId: string,
  lifecycle: ServiceLifecycle,
): Promise<ServiceResponse> {
  return apiRequest(`/services/${serviceId}/lifecycle`, {
    method: "POST",
    body: JSON.stringify({ lifecycle }),
  });
}

export function deleteService(serviceId: string): Promise<void> {
  return apiRequest(`/services/${serviceId}`, { method: "DELETE" });
}

export function createServiceForm(
  serviceId: string,
  schema: ServiceFormSchema,
): Promise<FormVersionResponse> {
  return apiRequest(`/services/${serviceId}/form`, {
    method: "POST",
    body: JSON.stringify({ schema }),
  });
}

export function activateServiceFormVersion(
  serviceId: string,
  formVersionRef: string,
): Promise<FormVersionResponse> {
  return apiRequest(
    `/services/${serviceId}/form/versions/${formVersionRef}/activate`,
    { method: "POST" },
  );
}

export function getService(serviceId: string): Promise<ServiceResponse> {
  return apiRequest(`/services/${serviceId}`);
}

export function getServiceForm(serviceId: string): Promise<ServiceFormResponse> {
  return apiRequest(`/services/${serviceId}/form`);
}

export function getTicketCreationEligibility(
  serviceId: string,
): Promise<ServiceTicketCreationEligibility> {
  return apiRequest(`/services/${serviceId}/ticket-creation-eligibility`);
}

export function activeFormVersion(
  form: ServiceFormResponse,
): FormVersionResponse | null {
  const activeRef = form.activeFormVersionRef;
  if (activeRef === null) {
    return null;
  }
  return form.versions.find((version) => version.formVersionRef === activeRef) ?? null;
}
