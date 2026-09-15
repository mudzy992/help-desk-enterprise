import type {
  TicketPriority,
  TicketStatus,
} from '../../generated/prisma/enums';
import type { TicketMessageVisibility } from './collaboration.types';

export type TicketRealtimeChange =
  | 'updated'
  | 'status'
  | 'priority'
  | 'assignment'
  | 'routing'
  | 'sla'
  | 'approval'
  | 'reopened'
  | 'resolved'
  | 'closed'
  | 'archived';

export type TicketUpdatedRealtimePayload = {
  readonly ticketId: string;
  readonly change: TicketRealtimeChange;
  readonly sourceAction: string | null;
  readonly sourceMessageId: string | null;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly assignedUserId: string | null;
  readonly assignedGroupId: string | null;
  readonly requesterId: string;
  readonly archivedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly actorUserId: string | null;
  readonly occurredAt: string;
  readonly visibility: TicketMessageVisibility;
};

export type EdgeEventRealtimePublish = {
  readonly userId: string;
  readonly ticketId?: string;
  readonly eventName: string;
  readonly data: unknown;
};
