import { apiRequest } from "@/services/api";
import type { TicketResponse } from "@/services/tickets-api";

export type SplitTicketChildInput = {
  readonly title?: string;
  readonly description?: string;
  readonly serviceId?: string;
  readonly assignedGroupId?: string;
  readonly messageIds?: readonly string[];
  readonly attachmentIds?: readonly string[];
  readonly moveAttachments?: boolean;
};

export type SplitTicketInput = {
  readonly reason?: string;
  readonly children: readonly SplitTicketChildInput[];
};

export type SplitTicketResult = {
  readonly parent: TicketResponse;
  readonly children: readonly TicketResponse[];
};

export function splitTicket(
  ticketId: string,
  input: SplitTicketInput,
): Promise<SplitTicketResult> {
  return apiRequest(`/tickets/${ticketId}/split`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
