import { ticketsTestIds } from './create-tickets-service-harness';
import type { CreateTicketInput } from './tickets.types';

export function vpnCreateInput(
  overrides: Partial<CreateTicketInput> = {},
): CreateTicketInput {
  return {
    title: 'VPN is down',
    description: 'Cannot connect from the office',
    impact: 'MEDIUM',
    urgency: 'HIGH',
    serviceId: ticketsTestIds.serviceVpn,
    originUnitId: ticketsTestIds.ouIt,
    ...overrides,
  };
}
