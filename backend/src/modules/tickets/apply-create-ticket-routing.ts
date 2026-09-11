import type { TicketStatus } from '../../generated/prisma/enums';
import { RoutingError } from '../routing/routing.error';
import { routingOutcomes } from '../routing/routing.constants';
import { RoutingService } from '../routing/routing.service';
import { TicketsError } from './tickets.error';

export async function applyCreateTicketRouting(
  routingService: RoutingService,
  input: { readonly originUnitId: string; readonly serviceId: string },
): Promise<{
  readonly status: TicketStatus;
  readonly assignedGroupId: string | null;
}> {
  try {
    const resolution = await routingService.resolve(input);
    if (
      resolution.outcome === routingOutcomes.unrouted ||
      resolution.groupId === null
    ) {
      return { status: 'UNROUTED', assignedGroupId: null };
    }
    return { status: 'PENDING', assignedGroupId: resolution.groupId };
  } catch (error) {
    if (error instanceof RoutingError && error.code === 'UNAVAILABLE') {
      throw new TicketsError('ROUTING_UNAVAILABLE');
    }
    throw error;
  }
}
