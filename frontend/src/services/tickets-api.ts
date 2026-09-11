import { apiRequest } from "@/services/api";

export type TicketStatus =
  | "PENDING"
  | "UNROUTED"
  | "PENDING_APPROVAL"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "WAITING_FOR_USER"
  | "RESOLVED"
  | "CLOSED"
  | "ARCHIVED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TicketImpact = TicketPriority;
export type TicketUrgency = TicketPriority;

export type TicketResponse = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly description: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly classification: string;
  readonly isConfidential: boolean;
  readonly formData: unknown;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly formVersionRef: string;
  readonly requesterId: string;
  readonly assignedGroupId: string | null;
  readonly assignedUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateTicketInput = {
  readonly title: string;
  readonly description: string;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly serviceId: string;
  readonly originUnitId?: string;
  readonly formVersionRef?: string;
  readonly formData?: Record<string, unknown>;
};

export type UpdateTicketInput = {
  readonly title?: string;
  readonly description?: string;
  readonly impact?: TicketImpact;
  readonly urgency?: TicketUrgency;
  readonly status?: TicketStatus;
  readonly formData?: Record<string, unknown>;
};

export type ListTicketsQuery = {
  readonly originUnitId?: string;
  readonly serviceId?: string;
  readonly status?: TicketStatus;
};

export function createTicket(input: CreateTicketInput): Promise<TicketResponse> {
  return apiRequest("/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listTickets(
  query: ListTicketsQuery = {},
): Promise<readonly TicketResponse[]> {
  const search = new URLSearchParams();
  if (query.originUnitId !== undefined) {
    search.set("originUnitId", query.originUnitId);
  }
  if (query.serviceId !== undefined) {
    search.set("serviceId", query.serviceId);
  }
  if (query.status !== undefined) {
    search.set("status", query.status);
  }
  const suffix = search.toString() === "" ? "" : `?${search.toString()}`;
  return apiRequest(`/tickets${suffix}`);
}

export function getTicket(ticketId: string): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}`);
}

export function updateTicket(
  ticketId: string,
  input: UpdateTicketInput,
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
