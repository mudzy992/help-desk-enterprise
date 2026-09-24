import {
  toTicketListSearchParams,
  type TicketPageQuery,
} from "@/lib/tickets/ticket-list-search-params";
import { apiRequest } from "@/services/api";

export type TicketSlaSnapshot = {
  readonly slaProfileId: string | null;
  readonly startedAt: string;
  readonly responseDueAt: string | null;
  readonly resolutionDueAt: string | null;
  readonly respondedAt: string | null;
  readonly resolutionCompletedAt: string | null;
  readonly pausedAt: string | null;
  readonly isResponseBreached: boolean;
  readonly isResolutionBreached: boolean;
  readonly isResponseAtRisk: boolean;
  readonly isResolutionAtRisk: boolean;
};

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
  readonly parentTicketId?: string | null;
  readonly parentTicketNumber?: string | null;
  readonly parentTicketTitle?: string | null;
  readonly requesterName?: string | null;
  readonly assignedUserName?: string | null;
  readonly assignedGroupName?: string | null;
  readonly formVersionNumber?: number | null;
  readonly originUnitName?: string | null;
  readonly originUnitPath?: string | null;
  readonly serviceName?: string | null;
  readonly mergedIntoTicketId?: string | null;
  readonly reopenedFromTicketId?: string | null;
  readonly resolvedAt?: string | null;
  readonly closedAt?: string | null;
  readonly archivedAt?: string | null;
  readonly waitingForUserEnteredAt?: string | null;
  readonly isOverdue?: boolean;
  readonly isAtRisk?: boolean;
  readonly sla?: TicketSlaSnapshot | null;
  readonly reopen?: TicketReopenDescriptor;
  readonly closePolicy?: TicketClosePolicy;
  readonly csat?: TicketCsatDescriptor;
  readonly redactionWarnings?: readonly RedactionMatch[];
  readonly duplicateWarnings?: readonly DuplicateTicketMatch[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RedactionMatch = {
  readonly field: string;
  readonly patternId: string;
  readonly risk: "standard" | "high";
};

export type DuplicateTicketMatch = {
  readonly ticketId: string;
  readonly ticketNumber: string;
  readonly similarity: number;
};

export type CloseCodeDescriptor = {
  readonly key: string;
  readonly name: string;
};

export type TicketClosePolicy = {
  readonly enabled: boolean;
  readonly requireOnResolve: boolean;
  readonly allowedCodes: readonly CloseCodeDescriptor[];
  readonly closeCode: CloseCodeDescriptor | null;
  readonly resolutionNote: string | null;
};

export type TicketReopenDescriptor = {
  readonly enabled: boolean;
  readonly eligible: boolean;
  readonly createsNewTicket: boolean;
  readonly windowEndsAt: string | null;
};

export type TicketCsatDescriptor = {
  readonly enabled: boolean;
  readonly canSubmit: boolean;
  readonly submitted: boolean;
  readonly rating: number | null;
  readonly comment: string | null;
  readonly scaleMax: number;
  readonly askOnResolved: boolean;
  readonly askOnClosed: boolean;
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
  readonly acknowledgeDuplicate?: boolean;
};

export type UpdateTicketInput = {
  readonly title?: string;
  readonly description?: string;
  readonly impact?: TicketImpact;
  readonly urgency?: TicketUrgency;
  readonly status?: TicketStatus;
  readonly formData?: Record<string, unknown>;
  readonly closeCode?: string;
  readonly resolutionNote?: string;
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

export async function listGroupInbox(): Promise<readonly TicketResponse[]> {
  // The inbox endpoint answers the same page envelope as GET /tickets, so the
  // array is unwrapped here rather than treating the response as the array.
  const response = await apiRequest<TicketPage>("/tickets/inbox");
  return response.items;
}

export type GroupInboxStatus = {
  readonly hasGroupMembership: boolean;
};

export function getGroupInboxStatus(): Promise<GroupInboxStatus> {
  return apiRequest("/tickets/inbox/status");
}

export function claimTicket(ticketId: string): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/claim`, { method: "POST" });
}

export type TicketPage = {
  readonly items: readonly TicketResponse[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
};

/**
 * One page of the visible tickets (phase 1.1, plan §1.1).
 *
 * `GET /tickets` always answers this envelope now: it used to return a plain
 * array with every ticket in the table when no `page`/`pageSize` was sent, and
 * four screens did exactly that. This is the only list read the client has.
 */
export function listTicketsPage(
  query: TicketPageQuery = {},
): Promise<TicketPage> {
  const search = toTicketListSearchParams(query).toString();
  return apiRequest(`/tickets?${search}`);
}

/**
 * First page of the tickets narrowed by the three basic filters. Kept for the
 * screens that only need a small slice while their dedicated endpoints arrive
 * (dashboard/SLA aggregates in phase 2.4, `/search` in phase 1.2).
 */
export function listTickets(
  query: ListTicketsQuery = {},
): Promise<TicketPage> {
  return listTicketsPage({
    originUnitId: query.originUnitId,
    serviceId: query.serviceId,
    status: query.status,
  });
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

export function reopenTicket(
  ticketId: string,
  input: { comment?: string } = {},
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/reopen`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
