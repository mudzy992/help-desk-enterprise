import { apiRequest } from "@/services/api";

export type TicketRemoteRequestResponse = {
  readonly ticketId: string;
  readonly requestedAt: string;
  readonly rateLimitMinutes: number;
};

export function requestTicketRemote(
  ticketId: string,
): Promise<TicketRemoteRequestResponse> {
  return apiRequest(`/tickets/${ticketId}/remote-requests`, { method: "POST" });
}
