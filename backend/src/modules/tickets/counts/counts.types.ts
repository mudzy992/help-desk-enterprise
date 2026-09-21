import type { TicketStatus } from '../../../generated/prisma/enums';
import type { TicketListQuery } from '../list/list-tickets.types';

/** The list filters that narrow *what is counted*; the rest is broken down. */
export type TicketCountsQuery = Pick<
  TicketListQuery,
  | 'originUnitId'
  | 'serviceId'
  | 'assignedUserId'
  | 'priority'
  | 'requesterId'
  | 'groupId'
  | 'unassigned'
  | 'createdFrom'
  | 'createdTo'
  | 'q'
>;

export type TicketCounts = {
  /** Visible tickets that are not RESOLVED, CLOSED or ARCHIVED. */
  readonly open: number;
  readonly unrouted: number;
  /** Size of the caller's group inbox (unaffected by the narrowing filters). */
  readonly inbox: number;
  /** Same tickets as `GET /tickets?overdue=true`. */
  readonly overdue: number;
  /** Same tickets as `GET /tickets?atRisk=true`. */
  readonly atRisk: number;
  readonly byStatus: Readonly<Record<TicketStatus, number>>;
};
