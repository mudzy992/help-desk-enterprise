import { apiRequest } from "@/services/api";

export type ParticipantRole =
  | "REQUESTER"
  | "ASSIGNEE"
  | "HANDLER_GROUP"
  | "APPROVER"
  | "FORWARDED_FROM_GROUP"
  | "FORWARDED_TO_GROUP"
  | "WATCHER"
  | "SYSTEM";

export type MessageType =
  | "USER_REPLY"
  | "AGENT_REPLY"
  | "INTERNAL_NOTE"
  | "SYSTEM_EVENT"
  | "APPROVAL_DECISION";

export type TicketParticipantResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly role: ParticipantRole;
  readonly userId: string | null;
  readonly groupId: string | null;
  readonly createdAt: string;
};

export type TicketMessageResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly type: MessageType;
  readonly body: string;
  readonly authorUserId: string | null;
  readonly createdAt: string;
};

export type TicketTimeLogResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly userId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSeconds: number | null;
  readonly createdAt: string;
};

export function listTicketParticipants(
  ticketId: string,
): Promise<readonly TicketParticipantResponse[]> {
  return apiRequest(`/tickets/${ticketId}/participants`);
}

export function addTicketParticipant(
  ticketId: string,
  input: {
    readonly role: ParticipantRole;
    readonly userId?: string;
    readonly groupId?: string;
  },
): Promise<TicketParticipantResponse> {
  return apiRequest(`/tickets/${ticketId}/participants`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removeTicketParticipant(
  ticketId: string,
  participantId: string,
): Promise<void> {
  return apiRequest(`/tickets/${ticketId}/participants/${participantId}`, {
    method: "DELETE",
  });
}

export function listTicketMessages(
  ticketId: string,
): Promise<readonly TicketMessageResponse[]> {
  return apiRequest(`/tickets/${ticketId}/messages`);
}

export function createTicketMessage(
  ticketId: string,
  input: { readonly type: MessageType; readonly body: string },
): Promise<TicketMessageResponse> {
  return apiRequest(`/tickets/${ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listTicketTimeLogs(
  ticketId: string,
): Promise<readonly TicketTimeLogResponse[]> {
  return apiRequest(`/tickets/${ticketId}/time-logs`);
}

export function startTicketTimeLog(
  ticketId: string,
): Promise<TicketTimeLogResponse> {
  return apiRequest(`/tickets/${ticketId}/time-logs/start`, { method: "POST" });
}

export function stopTicketTimeLog(
  ticketId: string,
  timeLogId: string,
): Promise<TicketTimeLogResponse> {
  return apiRequest(`/tickets/${ticketId}/time-logs/${timeLogId}/stop`, {
    method: "POST",
  });
}
