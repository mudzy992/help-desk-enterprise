import { apiRequest } from "@/services/api";
import type { TicketResponse } from "@/services/tickets-api";

export type ForwardTicketInput = {
  readonly targetGroupId: string;
  readonly targetUserId?: string;
  readonly reason?: string;
  readonly keepMeAsWatcher?: boolean;
};

export type ForwardTargetGroup = {
  readonly id: string;
  readonly name: string;
  readonly organizationalUnitId: string;
  readonly organizationalUnitName: string | null;
  readonly organizationalUnitPath: string | null;
  readonly isCrossOu: boolean;
  readonly isCurrent: boolean;
  readonly memberCount: number;
};

export type ForwardTargetsResponse = {
  readonly currentGroupId: string | null;
  readonly currentUnitId: string;
  readonly previousGroupId: string | null;
  readonly requireReason: boolean;
  readonly minReasonLength: number;
  readonly crossOuAllowed: boolean;
  readonly groups: readonly ForwardTargetGroup[];
};

export type ForwardHistoryItem = {
  readonly id: string;
  readonly fromGroupId: string | null;
  readonly fromGroupName: string | null;
  readonly fromUnitName: string | null;
  readonly toGroupId: string;
  readonly toGroupName: string;
  readonly toUnitName: string | null;
  readonly toUserId: string | null;
  readonly toUserName: string | null;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly reason: string;
  readonly isCrossOu: boolean;
  readonly viaBulk: boolean;
  readonly createdAt: string;
};

export function forwardTicket(
  ticketId: string,
  input: ForwardTicketInput,
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/forward`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listForwardTargets(
  ticketId: string,
  query?: string,
): Promise<ForwardTargetsResponse> {
  const search = query && query.trim().length > 0 ? `?q=${encodeURIComponent(query.trim())}` : "";
  return apiRequest(`/tickets/${ticketId}/forward-targets${search}`);
}

export function listForwardHistory(ticketId: string): Promise<readonly ForwardHistoryItem[]> {
  return apiRequest(`/tickets/${ticketId}/forward-history`);
}

export type ForwardTargetAgent = {
  readonly id: string;
  readonly displayName: string;
};

export function listForwardTargetAgents(
  ticketId: string,
  groupId: string,
): Promise<readonly ForwardTargetAgent[]> {
  return apiRequest(
    `/tickets/${ticketId}/forward-targets/${encodeURIComponent(groupId)}/agents`,
  );
}
