import { TicketsError } from '../tickets.error';
import type { TicketGuardrailsConfiguration } from './guardrails.types';

export function assertBulkBroadcastConfirmation(input: {
  readonly configuration: TicketGuardrailsConfiguration;
  readonly recipientCount: number;
  readonly broadcastConfirmed?: boolean;
}): void {
  if (input.recipientCount <= input.configuration.confirmAboveRecipients) {
    return;
  }
  if (input.broadcastConfirmed === true) {
    return;
  }
  throw new TicketsError(
    'BULK_BROADCAST_CONFIRMATION_REQUIRED',
    'BULK_BROADCAST_CONFIRMATION_REQUIRED',
    {
      recipientCount: input.recipientCount,
      confirmAboveRecipients: input.configuration.confirmAboveRecipients,
    },
  );
}

export function requiresBulkBroadcastConfirmation(input: {
  readonly configuration: TicketGuardrailsConfiguration;
  readonly recipientCount: number;
}): boolean {
  return input.recipientCount > input.configuration.confirmAboveRecipients;
}
