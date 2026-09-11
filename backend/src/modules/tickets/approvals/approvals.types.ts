import type { ApprovalStatus } from '../../../generated/prisma/enums';

export type DefaultApproverRole = 'ADMIN' | 'AGENT' | 'SUPER_ADMIN';

export type TicketApprovalDecision = 'APPROVED' | 'REJECTED';

export type TicketApprovalsConfiguration = {
  readonly enabled: boolean;
  readonly requiredByService: Readonly<Record<string, boolean>>;
  readonly defaultApproverRole: DefaultApproverRole;
  readonly allowRequesterManager: boolean;
};

export type TicketApprovalRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly stepOrder: number;
  readonly status: ApprovalStatus;
  readonly approverUserId: string | null;
  readonly comment: string | null;
  readonly decidedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

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

export type DecideTicketApprovalInput = {
  readonly comment: string;
};
