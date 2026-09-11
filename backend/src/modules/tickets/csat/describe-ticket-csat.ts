import { canActorSubmitTicketCsat } from './can-submit-ticket-csat';
import type { TicketCsatConfiguration, TicketCsatDescriptor, TicketCsatRecord } from './csat.types';
import type { TicketRecord } from '../tickets.types';

export function describeTicketCsat(input: {
  readonly ticket: TicketRecord;
  readonly configuration: TicketCsatConfiguration;
  readonly submission: TicketCsatRecord | null;
  readonly actorUserId: string;
}): TicketCsatDescriptor {
  const submitted = input.submission !== null;
  return {
    enabled: input.configuration.enabled,
    canSubmit: canActorSubmitTicketCsat({
      configuration: input.configuration,
      ticketId: input.ticket.id,
      status: input.ticket.status,
      requesterId: input.ticket.requesterId,
      actorUserId: input.actorUserId,
      alreadySubmitted: submitted,
    }),
    submitted,
    rating: input.submission?.rating ?? null,
    comment: input.submission?.comment ?? null,
    scaleMax: input.configuration.scaleMax,
    askOnResolved: input.configuration.askOnResolved,
    askOnClosed: input.configuration.askOnClosed,
  };
}
