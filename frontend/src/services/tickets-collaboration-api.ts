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
  readonly redactionWarnings?: readonly {
    readonly field: string;
    readonly patternId: string;
    readonly risk: "standard" | "high";
  }[];
};

export type TicketTimeLogResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly userId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSeconds: number | null;
  readonly createdAt: string;
  /** Package 1.3 */
  readonly source?: TimeLogSource;
  readonly stopReason?: TimeLogStopReason | null;
  readonly note?: string | null;
  readonly correctedAt?: string | null;
  readonly correctedByUserId?: string | null;
  readonly correctionReason?: string | null;
  readonly deletedAt?: string | null;
  readonly deletedByUserId?: string | null;
  readonly deleteReason?: string | null;
};

export type TimeLogSource = "TIMER" | "MANUAL";
export type TimeLogStopReason =
  | "MANUAL"
  | "AUTO_IDLE"
  | "AUTO_MAX_DURATION"
  | "AUTO_TICKET_CLOSED";

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
  input: {
    readonly type: MessageType;
    readonly body: string;
    /** Package 1.2: copy a public reply to merged child tickets. */
    readonly alsoToMerged?: boolean;
  },
): Promise<TicketMessageResponse> {
  return apiRequest(`/tickets/${ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listTicketTimeLogs(
  ticketId: string,
  options: { readonly includeDeleted?: boolean } = {},
): Promise<readonly TicketTimeLogResponse[]> {
  const query = options.includeDeleted === true ? "?includeDeleted=true" : "";
  return apiRequest(`/tickets/${ticketId}/time-logs${query}`);
}

export function startTicketTimeLog(
  ticketId: string,
  options: { readonly switchFromActive?: boolean } = {},
): Promise<TicketTimeLogResponse> {
  return apiRequest(`/tickets/${ticketId}/time-logs/start`, {
    method: "POST",
    body: JSON.stringify(options.switchFromActive === true ? { switchFromActive: true } : {}),
  });
}

export function stopTicketTimeLog(
  ticketId: string,
  timeLogId: string,
  options: { readonly reason?: "MANUAL" | "AUTO_IDLE"; readonly endedAt?: string } = {},
): Promise<TicketTimeLogResponse> {
  return apiRequest(`/tickets/${ticketId}/time-logs/${timeLogId}/stop`, {
    method: "POST",
    body: JSON.stringify(options),
  });
}

/** Package 1.3 (T3): proof of activity; the server ignores calls closer than 20 s. */
export function heartbeatTicketTimeLog(ticketId: string, timeLogId: string): Promise<void> {
  return apiRequest(`/tickets/${ticketId}/time-logs/${timeLogId}/heartbeat`, {
    method: "POST",
  });
}

export function addManualTicketTimeLog(
  ticketId: string,
  input: { readonly startedAt: string; readonly durationMinutes: number; readonly note: string },
): Promise<TicketTimeLogResponse> {
  return apiRequest(`/tickets/${ticketId}/time-logs/manual`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function correctTicketTimeLog(
  ticketId: string,
  timeLogId: string,
  input: {
    readonly startedAt?: string;
    readonly endedAt?: string;
    readonly note?: string;
    readonly reason: string;
  },
): Promise<TicketTimeLogResponse> {
  return apiRequest(`/tickets/${ticketId}/time-logs/${timeLogId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTicketTimeLog(
  ticketId: string,
  timeLogId: string,
  reason: string,
): Promise<TicketTimeLogResponse> {
  return apiRequest(`/tickets/${ticketId}/time-logs/${timeLogId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export type ActiveTimer = {
  readonly timeLogId: string;
  readonly ticketId: string;
  readonly ticketNumber: string;
  readonly ticketTitle: string;
  readonly startedAt: string;
};

export type TimeTrackingPolicy = {
  readonly idleAutoPauseMinutes: number;
  readonly autoResume: boolean;
  readonly maxSessionHours: number;
  readonly singleActivePerUser: boolean;
  readonly manualEntryEnabled: boolean;
  readonly maxBackdateDays: number;
  readonly manualMaxMinutes: number;
};

export type ActiveTimerResponse = {
  readonly timer: ActiveTimer | null;
  readonly policy: TimeTrackingPolicy;
};

export function getActiveTimer(): Promise<ActiveTimerResponse> {
  return apiRequest("/me/active-timer");
}
