import { apiRequest } from "@/services/api";

export type TicketPersonRef = {
  readonly id: string;
  readonly displayName: string;
};

export type TicketGroupRef = {
  readonly id: string;
  readonly name: string;
};

export type TicketPeopleResponse = {
  readonly users: readonly TicketPersonRef[];
  readonly groups: readonly TicketGroupRef[];
};

export type TicketCandidatesResponse = {
  readonly assignees: readonly TicketPersonRef[];
  readonly watchers: readonly TicketPersonRef[];
};

export type TicketHistoryField =
  | "status"
  | "priority"
  | "impact"
  | "urgency"
  | "assignedUser"
  | "assignedGroup";

export type TicketHistoryChange = {
  readonly field: TicketHistoryField;
  readonly from: string | null;
  readonly to: string | null;
};

export type TicketHistoryEntry = {
  readonly id: string;
  readonly createdAt: string;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly changes: readonly TicketHistoryChange[];
};

export type TicketPublicActivityEntry = {
  readonly id: string;
  readonly createdAt: string;
  readonly action: string;
  readonly actorName: string | null;
  readonly targetName: string | null;
};

export type TicketComposerAccess = "requester" | "staff" | "both";

export type TicketAllowedActions = {
  readonly composerAccess: TicketComposerAccess;
  readonly claim: boolean;
  readonly assign: boolean;
  readonly changeStatus: boolean;
  readonly split: boolean;
  readonly requestRemote: boolean;
  readonly addInternalNote: boolean;
  readonly waitForUser: boolean;
  readonly manageParticipants: boolean;
  readonly trackTime: boolean;
  readonly uploadAttachments: boolean;
  readonly viewActivity: boolean;
};

export type TicketSlaUnavailableReason =
  | "NO_PROFILE"
  | "PROFILE_INACTIVE"
  | "NO_RULE"
  | "NO_CALENDAR"
  | "NOT_APPLIED";

export type TicketSlaContextResponse = {
  readonly profileName: string | null;
  readonly calendarName: string | null;
  readonly unavailableReason: TicketSlaUnavailableReason | null;
};

export function getTicketPeople(ticketId: string): Promise<TicketPeopleResponse> {
  return apiRequest(`/tickets/${ticketId}/people`);
}

export function getTicketCandidates(ticketId: string): Promise<TicketCandidatesResponse> {
  return apiRequest(`/tickets/${ticketId}/candidates`);
}

export function getTicketHistory(ticketId: string): Promise<readonly TicketHistoryEntry[]> {
  return apiRequest(`/tickets/${ticketId}/history`);
}

export function getTicketPublicActivity(
  ticketId: string,
): Promise<readonly TicketPublicActivityEntry[]> {
  return apiRequest(`/tickets/${ticketId}/activity`);
}

export function getTicketAllowedActions(ticketId: string): Promise<TicketAllowedActions> {
  return apiRequest(`/tickets/${ticketId}/actions`);
}

export function getTicketSlaContext(ticketId: string): Promise<TicketSlaContextResponse> {
  return apiRequest(`/tickets/${ticketId}/sla-context`);
}
