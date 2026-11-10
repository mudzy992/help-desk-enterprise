import { ApiError, apiRequest, apiRequestValidated } from "@/services/api";
import { parseServiceCatalogPage, parseServiceResponse } from "@/services/critical-api-parsers";
import {
  listServiceCategories as listServiceCategoriesFromApi,
  type ServiceCategoryResponse as ServiceCategoryApiResponse,
} from "@/services/service-categories-api";

export type ServiceCategoryResponse = ServiceCategoryApiResponse;

export const listServiceCategories = listServiceCategoriesFromApi;

export type ServiceLifecycle = "DRAFT" | "ACTIVE" | "DEPRECATED";
export type ServiceAvailability = "OPERATIONAL" | "DEGRADED" | "DOWN" | "MAINTENANCE";
export type DataClassification = "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
export type AutoAssignStrategy = "NONE" | "LEAST_BUSY" | "ROUND_ROBIN";

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
  readonly upcomingDowntimeCount: number;
  readonly ticketCreationAllowed: true;
  readonly showStatusInTicketCreate: boolean;
  readonly activeDowntimeWindow: ServiceDowntimeWindowSummary | null;
  readonly upcomingDowntimeWindow: ServiceDowntimeWindowSummary | null;
  readonly effectiveAvailability?: "OPERATIONAL" | "DEGRADED" | "DOWN" | "MAINTENANCE";
};

export type ServiceActiveFormSummary = {
  readonly activeFormVersionRef: string | null;
  readonly version: number | null;
  readonly fieldCount: number;
};

export type ServiceOnboardingSummary = {
  readonly status: "IN_PROGRESS" | "READY_FOR_FINALIZATION" | "ABANDONED" | "COMPLETED";
  readonly currentStep: "SERVICE" | "FORM" | "ROUTING" | "SLA" | "APPROVALS";
  readonly completedSteps: readonly ("SERVICE" | "FORM" | "ROUTING" | "SLA" | "APPROVALS")[];
};

export type ServiceResponse = {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly lifecycle: ServiceLifecycle;
  readonly offeredToRequesters: boolean;
  readonly availability: ServiceAvailability;
  readonly runtimeAvailability: ServiceRuntimeAvailability;
  readonly classification: DataClassification;
  readonly requiresApproval: boolean;
  readonly approvalSteps: 0 | 1;
  readonly isConfidentialDefault: boolean;
  readonly autoAssignStrategy: AutoAssignStrategy;
  readonly slaProfileId: string | null;
  readonly policyPackId: string | null;
  readonly openTicketCount: number;
  readonly activeForm: ServiceActiveFormSummary;
  readonly onboarding?: ServiceOnboardingSummary | null;
  readonly incidentImpact?: "DEGRADED" | "DOWN" | "MAINTENANCE" | null;
  /** Paket 5.3.1: category label on list reads (requesters cannot read categories). */
  readonly category?: { readonly name: string; readonly sortOrder: number } | null;
};

export type ServiceListPage = {
  readonly items: readonly ServiceResponse[];
  readonly total: number;
  readonly take: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export type ServiceListQuery = {
  readonly lifecycle?: ServiceLifecycle;
  readonly categoryId?: string | null;
  readonly offeredOnly?: boolean;
  readonly search?: string;
  readonly originUnitId?: string | null;
  readonly take?: number;
  readonly cursor?: string | null;
};

export type CreateServiceInput = {
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly classification?: DataClassification;
  readonly requiresApproval?: boolean;
  readonly isConfidentialDefault?: boolean;
  readonly autoAssignStrategy?: AutoAssignStrategy;
  readonly policyPackId?: string | null;
  readonly slaProfileId?: string | null;
  readonly reason: string;
};

export type UpdateServiceInput = {
  readonly name?: string;
  readonly categoryId?: string;
  readonly classification?: DataClassification;
  readonly requiresApproval?: boolean;
  readonly isConfidentialDefault?: boolean;
  readonly autoAssignStrategy?: AutoAssignStrategy;
  readonly policyPackId?: string | null;
  readonly slaProfileId?: string | null;
  readonly reason: string;
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

export const serviceFormVersionsClientPageSize = 20;
export const serviceFormVersionsClientMaximumPages = 25;

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
  readonly formsEnabled: boolean;
  readonly requireVersionOnTicket: boolean;
  readonly activeFormVersionRef: string | null;
  readonly activeForm: FormVersionResponse | null;
  readonly versions: readonly FormVersionResponse[];
  readonly total: number;
  readonly take: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export type ServiceActiveFormResponse = {
  readonly serviceId: string;
  readonly formsEnabled: boolean;
  readonly requireVersionOnTicket: boolean;
  readonly activeForm: FormVersionResponse | null;
};

export type ServiceTicketCreationEligibility = {
  readonly allowed: true;
  readonly blockedByAvailability: false;
  readonly serviceId: string;
  readonly runtimeAvailability: ServiceRuntimeAvailability;
};

export const serviceListPageSize = 100;
export const serviceListMaximumAggregatePages = 10;

export function listServicePage(query: ServiceListQuery = {}): Promise<ServiceListPage> {
  const params = new URLSearchParams();
  if (query.lifecycle !== undefined) params.set("lifecycle", query.lifecycle);
  if (query.categoryId !== undefined && query.categoryId !== null)
    params.set("categoryId", query.categoryId);
  if (query.offeredOnly === true) params.set("offeredOnly", "true");
  if (query.search !== undefined && query.search.length > 0) params.set("search", query.search);
  if (query.originUnitId !== undefined && query.originUnitId !== null)
    params.set("originUnitId", query.originUnitId);
  if (query.take !== undefined) params.set("take", String(query.take));
  if (query.cursor !== undefined && query.cursor !== null) params.set("cursor", query.cursor);
  const serialized = params.toString();
  const path = serialized.length === 0 ? "/services" : `/services?${serialized}`;
  return apiRequestValidated(path, parseServiceCatalogPage);
}

export async function collectServicePages(
  loadPage: (query: ServiceListQuery) => Promise<ServiceListPage>,
  filters: Omit<ServiceListQuery, "take" | "cursor"> = {},
): Promise<readonly ServiceResponse[]> {
  const items: ServiceResponse[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < serviceListMaximumAggregatePages; pageNumber += 1) {
    const page = await loadPage({ ...filters, take: serviceListPageSize, cursor });
    items.push(...page.items);
    if (!page.hasMore) return items;
    const nextCursor = page.nextCursor;
    if (nextCursor === null || seenCursors.has(nextCursor) || page.items.length === 0) {
      throw new ApiError(
        502,
        "INVALID_SERVICE_LIST_PAGINATION",
        "Service list pagination did not advance safely",
      );
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  throw new ApiError(
    502,
    "SERVICE_CATALOG_RESOURCE_LIMIT_EXCEEDED",
    `Service list exceeds the ${serviceListMaximumAggregatePages * serviceListPageSize}-item client aggregation ceiling; use a filtered catalog page.`,
  );
}

export function listOfferedServices(): Promise<readonly ServiceResponse[]> {
  return collectServicePages(listServicePage, { offeredOnly: true });
}

export function listServices(): Promise<readonly ServiceResponse[]> {
  return collectServicePages(listServicePage);
}

export function createService(input: CreateServiceInput): Promise<ServiceResponse> {
  return apiRequestValidated("/services", parseServiceResponse, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateService(
  serviceId: string,
  input: UpdateServiceInput,
  revision: number,
): Promise<ServiceResponse> {
  return apiRequestValidated(`/services/${serviceId}`, parseServiceResponse, {
    method: "PATCH",
    headers: { "If-Match": `"v${revision}"` },
    body: JSON.stringify(input),
  });
}

export function transitionServiceLifecycle(
  serviceId: string,
  lifecycle: ServiceLifecycle,
  revision: number,
  reason: string,
): Promise<ServiceResponse> {
  return apiRequestValidated(`/services/${serviceId}/lifecycle`, parseServiceResponse, {
    method: "POST",
    headers: { "If-Match": `"v${revision}"` },
    body: JSON.stringify({ lifecycle, reason }),
  });
}

export function updateServiceAvailability(
  serviceId: string,
  availability: ServiceAvailability,
  revision: number,
  reason?: string,
): Promise<ServiceResponse> {
  return apiRequestValidated(`/services/${serviceId}/availability`, parseServiceResponse, {
    method: "PATCH",
    headers: { "If-Match": `"v${revision}"` },
    body: JSON.stringify({ availability, ...(reason === undefined ? {} : { reason }) }),
  });
}

export function deleteService(serviceId: string, reason: string): Promise<void> {
  const params = new URLSearchParams({ reason });
  return apiRequest(`/services/${serviceId}?${params.toString()}`, { method: "DELETE" });
}

export function createServiceForm(
  serviceId: string,
  schema: ServiceFormSchema,
  reason: string,
): Promise<FormVersionResponse> {
  return apiRequest(`/services/${serviceId}/form`, {
    method: "POST",
    body: JSON.stringify({ schema, reason }),
  });
}

export function activateServiceFormVersion(
  serviceId: string,
  formVersionRef: string,
  reason: string,
): Promise<FormVersionResponse> {
  return apiRequest(`/services/${serviceId}/form/versions/${formVersionRef}/activate`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function getService(serviceId: string): Promise<ServiceResponse> {
  return apiRequest(`/services/${serviceId}`);
}

export function getServiceForm(
  serviceId: string,
  query: { readonly take?: number; readonly cursor?: string | null } = {},
): Promise<ServiceFormResponse> {
  const params = new URLSearchParams();
  if (query.take !== undefined) params.set("take", String(query.take));
  if (query.cursor !== undefined && query.cursor !== null) params.set("cursor", query.cursor);
  const serialized = params.toString();
  const path =
    serialized.length === 0
      ? `/services/${serviceId}/form`
      : `/services/${serviceId}/form?${serialized}`;
  return apiRequest(path);
}

export function getActiveServiceForm(serviceId: string): Promise<ServiceActiveFormResponse> {
  return apiRequest(`/services/${serviceId}/form/active`);
}

export function getTicketCreationEligibility(
  serviceId: string,
): Promise<ServiceTicketCreationEligibility> {
  return apiRequest(`/services/${serviceId}/ticket-creation-eligibility`);
}

export function activeFormVersion(form: ServiceFormResponse): FormVersionResponse | null {
  const activeRef = form.activeFormVersionRef;
  if (activeRef === null) {
    return null;
  }
  return (
    form.versions.find((version) => version.formVersionRef === activeRef) ??
    (form.activeForm?.formVersionRef === activeRef ? form.activeForm : null)
  );
}
