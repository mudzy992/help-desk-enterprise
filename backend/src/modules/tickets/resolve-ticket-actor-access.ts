import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { canManageTicketsInScope } from './authorize-ticket-actor';
import type { TicketActorAccess } from './collaboration.types';
import { TicketsError } from './tickets.error';
import type { TicketRecord } from './tickets.types';

export function isTicketStaffActor(input: {
  readonly context: AuthorizationContext;
  readonly originUnitId: string;
  readonly originUnitPath: string;
  readonly serviceId: string;
}): boolean {
  if (input.context.isSuperAdmin) {
    return true;
  }
  return canManageTicketsInScope(input);
}

export async function resolveTicketActorAccess(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly ticket: TicketRecord;
    readonly originUnitPath: string;
  },
): Promise<TicketActorAccess> {
  if (
    isTicketStaffActor({
      context: input.context,
      originUnitId: input.ticket.originUnitId,
      originUnitPath: input.originUnitPath,
      serviceId: input.ticket.serviceId,
    })
  ) {
    return { visibility: 'staff' };
  }
  if (input.context.subjectId === input.ticket.requesterId) {
    return { visibility: 'public' };
  }
  const participant = await prisma.ticketParticipant.findFirst({
    where: {
      ticketId: input.ticket.id,
      userId: input.context.subjectId,
    },
    select: { id: true },
  });
  if (participant !== null) {
    return { visibility: 'public' };
  }
  throw new TicketsError('FORBIDDEN');
}
