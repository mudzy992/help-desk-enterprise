import { apiRequest } from "@/services/api";

/**
 * Paket 2.7 (§8): `/status/*`. Types mirror `backend/src/modules/status-page`.
 * Reading is open to signed-in users (requesters see ALL_USERS incidents
 * only); managing needs `status.incidents.manage`.
 */

export const incidentImpacts = ["DEGRADED", "DOWN", "MAINTENANCE"] as const;
export type IncidentImpact = (typeof incidentImpacts)[number];
export const incidentStatuses = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] as const;
export type IncidentStatus = (typeof incidentStatuses)[number];
export const incidentVisibilities = ["ALL_USERS", "STAFF_ONLY"] as const;
export type IncidentVisibility = (typeof incidentVisibilities)[number];
export type ServiceAvailabilityValue = "OPERATIONAL" | "DEGRADED" | "DOWN" | "MAINTENANCE";

export type IncidentUpdate = {
  readonly id: string;
  readonly status: IncidentStatus;
  readonly message: string;
  readonly createdAt: string;
  readonly authorName: string | null;
};

export type Incident = {
  readonly id: string;
  readonly title: string;
  readonly titleEn: string | null;
  readonly impact: IncidentImpact;
  readonly status: IncidentStatus;
  readonly visibility: IncidentVisibility;
  readonly startedAt: string;
  readonly resolvedAt: string | null;
  readonly services: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  /** Newest first. */
  readonly updates: readonly IncidentUpdate[];
  readonly linkedTicketCount: number | null;
  readonly subscriberCount: number | null;
  readonly subscribed: boolean;
};

export type StatusService = {
  readonly id: string;
  readonly name: string;
  readonly availability: ServiceAvailabilityValue;
  readonly incidentIds: readonly string[];
  readonly uptimePercent: number | null;
};

export type StatusPageOverview = {
  readonly generatedAt: string;
  readonly configuration: {
    readonly enabled: boolean;
    readonly public: boolean;
    readonly historyDays: number;
    readonly showUptimePercent: boolean;
  };
  readonly canManage: boolean;
  readonly affectedServiceCount: number;
  readonly categories: ReadonlyArray<{
    readonly id: string | null;
    readonly name: string | null;
    readonly services: readonly StatusService[];
  }>;
  readonly activeIncidents: readonly Incident[];
  readonly planned: ReadonlyArray<{
    readonly serviceId: string;
    readonly serviceName: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly message: string | null;
  }>;
  readonly history: readonly Incident[];
};

export type CreateIncidentInput = {
  readonly title: string;
  readonly titleEn?: string | null;
  readonly impact: IncidentImpact;
  readonly visibility: IncidentVisibility;
  readonly serviceIds: readonly string[];
  readonly message: string;
  readonly startedAt?: string;
  readonly notifyOpenTicketHolders?: boolean;
  readonly ticketIds?: readonly string[];
};

export type EditIncidentInput = {
  readonly title?: string;
  readonly titleEn?: string | null;
  readonly impact?: IncidentImpact;
  readonly visibility?: IncidentVisibility;
  readonly serviceIds?: readonly string[];
};

export type ResolvePreview = {
  readonly subscribers: number;
  readonly requesters: number;
  readonly recipients: number;
  readonly linkedTickets: number;
};

const id = (value: string) => encodeURIComponent(value);
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function getStatusOverview(): Promise<StatusPageOverview> {
  return apiRequest("/status");
}
export function listServiceIncidents(serviceId: string): Promise<{ readonly incidents: readonly Incident[] }> {
  return apiRequest(`/status/services/${id(serviceId)}/incidents`);
}
export function listTicketIncidents(ticketId: string): Promise<{ readonly staff: boolean; readonly incidents: readonly Incident[] }> {
  return apiRequest(`/status/tickets/${id(ticketId)}/incidents`);
}
export function createIncident(input: CreateIncidentInput): Promise<{ readonly id: string; readonly notified: number }> {
  return apiRequest("/status/incidents", json("POST", input));
}
export function editIncident(incidentId: string, input: EditIncidentInput): Promise<void> {
  return apiRequest(`/status/incidents/${id(incidentId)}`, json("PATCH", input));
}
export function postIncidentUpdate(
  incidentId: string,
  input: { readonly status: IncidentStatus; readonly message: string; readonly notifyOnResolve?: boolean },
): Promise<{ readonly notified: number }> {
  return apiRequest(`/status/incidents/${id(incidentId)}/updates`, json("POST", input));
}
export function getResolvePreview(incidentId: string): Promise<ResolvePreview> {
  return apiRequest(`/status/incidents/${id(incidentId)}/resolve-preview`);
}
export function linkTicketToIncident(incidentId: string, ticketId: string): Promise<{ readonly linked: boolean }> {
  return apiRequest(`/status/incidents/${id(incidentId)}/tickets`, json("POST", { ticketId }));
}
export function unlinkTicketFromIncident(incidentId: string, ticketId: string): Promise<{ readonly unlinked: boolean }> {
  return apiRequest(`/status/incidents/${id(incidentId)}/tickets/${id(ticketId)}`, json("DELETE"));
}
export function subscribeToIncident(incidentId: string): Promise<{ readonly subscribed: true }> {
  return apiRequest(`/status/incidents/${id(incidentId)}/subscription`, json("POST"));
}
export function unsubscribeFromIncident(incidentId: string): Promise<{ readonly subscribed: false }> {
  return apiRequest(`/status/incidents/${id(incidentId)}/subscription`, json("DELETE"));
}
