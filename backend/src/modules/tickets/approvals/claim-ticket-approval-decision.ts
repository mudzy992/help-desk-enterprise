import type { Prisma } from "../../../generated/prisma/client";
import { TicketsError } from "../tickets.error";
import type { TicketApprovalDecision } from "./approvals.types";

/**
 * Atomically claims the only pending approval decision and its ticket status
 * transition. Both conditional writes must run in the caller's transaction so
 * every losing concurrent request rolls back without an event or audit trace.
 */
export async function claimTicketApprovalDecision(input: {
  readonly transaction: Prisma.TransactionClient;
  readonly approvalId: string;
  readonly ticketId: string;
  readonly expectedTicketStatus: string;
  readonly nextTicketStatus: string;
  readonly decision: TicketApprovalDecision;
  readonly approverUserId: string;
  readonly comment: string;
  readonly decidedAt: Date;
  readonly ticketTimestamps: Readonly<Record<string, Date | null>>;
}): Promise<void> {
  const claimed = await input.transaction.ticketApproval.updateMany({
    where: {
      id: input.approvalId,
      ticketId: input.ticketId,
      status: "PENDING",
    },
    data: {
      status: input.decision,
      approverUserId: input.approverUserId,
      comment: input.comment,
      decidedAt: input.decidedAt,
    },
  });
  if (claimed.count !== 1) throw new TicketsError("APPROVAL_NOT_PENDING");

  const transitioned = await input.transaction.ticket.updateMany({
    where: { id: input.ticketId, status: input.expectedTicketStatus as never },
    data: {
      status: input.nextTicketStatus as never,
      ...input.ticketTimestamps,
    },
  });
  if (transitioned.count !== 1) {
    throw new TicketsError("APPROVAL_TRANSITION_FORBIDDEN");
  }
}
