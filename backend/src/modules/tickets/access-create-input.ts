import { ticketsTestIds } from './create-tickets-service-harness';
import type { CreateTicketInput } from './tickets.types';

export function accessCreateInput(
  overrides: Partial<CreateTicketInput> = {},
): CreateTicketInput {
  return {
    title: 'Mailbox access',
    description: 'Need finance mailbox access',
    impact: 'MEDIUM',
    urgency: 'HIGH',
    serviceId: ticketsTestIds.serviceAccess,
    originUnitId: ticketsTestIds.ouIt,
    ...overrides,
  };
}
