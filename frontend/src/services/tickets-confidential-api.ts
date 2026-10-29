import { apiRequest } from "@/services/api";

export type BreakGlassResponse = {
  readonly correlationId: string;
  readonly ticketId: string;
  readonly actorUserId: string;
  readonly expiresAt: string | null;
  readonly createdAt: string;
};

export function requestTicketBreakGlass(
  ticketId: string,
  reason: string,
  correlationId: string,
): Promise<BreakGlassResponse> {
  return apiRequest(`/tickets/${ticketId}/break-glass`, {
    method: "POST",
    body: JSON.stringify({ reason, correlationId }),
  });
}
