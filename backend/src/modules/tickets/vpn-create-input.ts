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
    formData: { asset_tag: 'LPT-001' },
    serviceId: ticketsTestIds.serviceVpn,
    originUnitId: ticketsTestIds.ouIt,
    ...overrides,
  };
}
