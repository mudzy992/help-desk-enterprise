import type { TicketMessageRecord } from '../collaboration.types';

export type TicketRemoteRequestResult = {
  readonly ticketId: string;
  readonly requestedAt: string;
  readonly rateLimitMinutes: number;
  readonly message: TicketMessageRecord;
};

export type TicketRemoteRequestResponse = {
  readonly ticketId: string;
  readonly requestedAt: string;
  readonly rateLimitMinutes: number;
};
