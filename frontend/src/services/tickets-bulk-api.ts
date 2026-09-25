import { apiRequest } from "@/services/api";
import type { TicketPriority, TicketResponse, TicketStatus } from "@/services/tickets-api";

export type TicketBulkActionType =
  | "assign_group"
  | "assign_user"
  | "set_status"
  | "set_priority"
  | "broadcast_message"
  | "merge_into_parent";

export type ExecuteTicketBulkInput = {
  readonly ticketIds: readonly string[];
  readonly actionType: TicketBulkActionType;
  readonly assignedGroupId?: string;
  readonly assignedUserId?: string;
  readonly status?: TicketStatus;
  readonly priority?: TicketPriority;
  readonly reason?: string;
  readonly parentTicketId?: string;
  readonly previewConfirmed?: boolean;
  readonly broadcastConfirmed?: boolean;
  readonly whatHappened?: string;
  readonly whoAffected?: string;
  readonly eta?: string;
  readonly workaround?: string;
};

export type TicketBulkPreview = {
  readonly ticketCount: number;
  readonly recipientCount: number;
  readonly emailRequested: boolean;
  readonly requiresConfirmation: boolean;
  readonly requiresBroadcastConfirmation: boolean;
};

export type TicketBulkResult = {
  readonly batchId: string | null;
  readonly actionType: TicketBulkActionType;
  readonly tickets: readonly TicketResponse[];
  readonly recipientCount?: number;
};

export function previewTicketBulk(
  ticketIds: readonly string[],
): Promise<TicketBulkPreview> {
  return apiRequest("/tickets/bulk/preview", {
    method: "POST",
    body: JSON.stringify({ ticketIds }),
  });
}

export function executeTicketBulk(
  input: ExecuteTicketBulkInput,
): Promise<TicketBulkResult> {
  return apiRequest("/tickets/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
