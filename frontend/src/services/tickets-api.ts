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

export function listGroupInbox(): Promise<readonly TicketResponse[]> {
  return apiRequest("/tickets/inbox");
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

export function reopenTicket(
  ticketId: string,
  input: { comment?: string } = {},
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/reopen`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
