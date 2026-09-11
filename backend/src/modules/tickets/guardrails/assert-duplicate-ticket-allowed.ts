import { TicketsError } from '../tickets.error';
import type {
  DuplicateTicketMatch,
  TicketGuardrailsConfiguration,
} from './guardrails.types';

export function assertDuplicateTicketAllowed(input: {
  readonly configuration: TicketGuardrailsConfiguration;
  readonly matches: readonly DuplicateTicketMatch[];
  readonly acknowledgeDuplicate?: boolean;
}): void {
  if (input.matches.length === 0 || input.configuration.mode !== 'soft_block') {
    return;
  }
  if (input.acknowledgeDuplicate === true) {
    return;
  }
  throw new TicketsError(
    'DUPLICATE_TICKET_BLOCKED',
    'DUPLICATE_TICKET_BLOCKED',
    {
      ticketIds: input.matches.map((match) => match.ticketId),
      ticketNumbers: input.matches.map((match) => match.ticketNumber),
    },
  );
}
