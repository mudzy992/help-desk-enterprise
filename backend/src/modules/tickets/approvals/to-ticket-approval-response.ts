import type {
  TicketApprovalRecord,
  TicketApprovalResponse,
} from './approvals.types';

export function toTicketApprovalResponse(
  record: TicketApprovalRecord,
  canDecide: boolean,
): TicketApprovalResponse {
  return {
    id: record.id,
    ticketId: record.ticketId,
    stepOrder: record.stepOrder,
    status: record.status,
    approverUserId: record.approverUserId,
    comment: record.comment,
    decidedAt: record.decidedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    canDecide: canDecide && record.status === 'PENDING',
  };
}
