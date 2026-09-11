import { apiRequest } from "@/services/api";
import type { TicketResponse } from "@/services/tickets-api";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export type TicketApprovalResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly stepOrder: number;
  readonly status: ApprovalStatus;
  readonly approverUserId: string | null;
  readonly comment: string | null;
  readonly decidedAt: string | null;
  readonly createdAt: string;
  readonly canDecide: boolean;
};

export function listTicketApprovals(
  ticketId: string,
): Promise<readonly TicketApprovalResponse[]> {
  return apiRequest(`/tickets/${ticketId}/approvals`);
}

export function approveTicketApproval(
  ticketId: string,
  approvalId: string,
  comment: string,
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/approvals/${approvalId}/approve`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
}

export function rejectTicketApproval(
  ticketId: string,
  approvalId: string,
  comment: string,
): Promise<TicketResponse> {
  return apiRequest(`/tickets/${ticketId}/approvals/${approvalId}/reject`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
}
