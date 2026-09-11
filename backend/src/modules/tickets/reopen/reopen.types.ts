import type { TicketStatus } from '../../../generated/prisma/enums';
import type { TicketReopenDescriptor } from '../tickets.types';

export type TicketReopenConfiguration = {
  readonly enabled: boolean;
  readonly windowDays: number;
};

export type TicketReopenMode = 'same_ticket' | 'new_ticket';

export type ResolvedTicketReopenPolicy = TicketReopenDescriptor & {
  readonly mode: TicketReopenMode | null;
};

export type ReopenTicketInput = {
  readonly comment?: string;
};

export type ReopenableTicketStatus = Extract<TicketStatus, 'RESOLVED' | 'CLOSED'>;
