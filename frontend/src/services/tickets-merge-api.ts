import { apiRequest } from "@/services/api";
import type { TicketPriority, TicketResponse } from "@/services/tickets-api";

/** Package 1.2 — manual priority, merge and unmerge. */
export type OverrideTicketPriorityInput =
  | { readonly priority: TicketPriority; readonly reason: string }
  | { readonly resetToMatrix: true; readonly reason: string };

export type MergedTicketItem = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly requesterId: string;
  readonly requesterName: string | null;
  readonly mergedAt: string | null;
};

export type MergeCandidate = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly status: string;
  readonly requesterName: string | null;
  readonly createdAt: string;
};

export function overrideTicketPriority(
  ticketId: string,
  input: OverrideTicketPriorityInput,
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/priority`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function mergeTicket(
  ticketId: string,
  input: { readonly parentTicketId: string; readonly reason: string },
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/merge`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function unmergeTicket(
  ticketId: string,
  input: { readonly reason: string },
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/unmerge`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listMergedTickets(ticketId: string): Promise<readonly MergedTicketItem[]> {
  return apiRequest(`/tickets/${ticketId}/merged`);
}

export function listMergeCandidates(
  ticketId: string,
  query: string,
): Promise<readonly MergeCandidate[]> {
  const search = new URLSearchParams({ q: query }).toString();
  return apiRequest(`/tickets/${ticketId}/merge-candidates?${search}`);
}
