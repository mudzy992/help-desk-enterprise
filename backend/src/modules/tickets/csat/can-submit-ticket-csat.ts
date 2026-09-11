import type { TicketStatus } from '../../../generated/prisma/enums';
import { isTicketCsatSampled } from './is-ticket-csat-sampled';
import type { TicketCsatConfiguration } from './csat.types';

export function isTicketCsatPromptStatus(
  status: TicketStatus,
  configuration: TicketCsatConfiguration,
): boolean {
  if (status === 'RESOLVED') {
    return configuration.askOnResolved;
  }
  if (status === 'CLOSED') {
    return configuration.askOnClosed;
  }
  return false;
}

export function canActorSubmitTicketCsat(input: {
  readonly configuration: TicketCsatConfiguration;
  readonly ticketId: string;
  readonly status: TicketStatus;
  readonly requesterId: string;
  readonly actorUserId: string;
  readonly alreadySubmitted: boolean;
}): boolean {
  return (
    input.configuration.enabled &&
    !input.alreadySubmitted &&
    input.actorUserId === input.requesterId &&
    isTicketCsatPromptStatus(input.status, input.configuration) &&
    isTicketCsatSampled(input.ticketId, input.configuration.samplingRate)
  );
}
