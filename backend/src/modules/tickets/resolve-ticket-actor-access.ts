import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { canHandleTicket } from './authorize-ticket-actor';
import { assertConfidentialTicketAccess } from './confidential/assert-confidential-ticket-access';
import { defaultTicketConfidentialConfiguration } from './confidential/confidential.constants';
import type { TicketConfidentialConfiguration } from './confidential/confidential.types';
import type { TicketActorAccess } from './collaboration.types';
import { TicketsError } from './tickets.error';
import type { TicketRecord } from './tickets.types';

export async function isTicketStaffActor(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly originUnitId: string;
    readonly originUnitPath: string;
    readonly serviceId: string;
    readonly assignedGroupId: string | null;
  },
): Promise<boolean> {
  return canHandleTicket(prisma, input);
}

export async function resolveTicketActorAccess(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly ticket: TicketRecord;
    readonly originUnitPath: string;
    readonly confidential?: TicketConfidentialConfiguration;
  },
): Promise<TicketActorAccess> {
  await assertConfidentialTicketAccess(prisma, {
    context: input.context,
    ticket: input.ticket,
    originUnitPath: input.originUnitPath,
    configuration:
      input.confidential ?? defaultTicketConfidentialConfiguration,
  });
  if (
    await isTicketStaffActor(prisma, {
      context: input.context,
      originUnitId: input.ticket.originUnitId,
      originUnitPath: input.originUnitPath,
      serviceId: input.ticket.serviceId,
      assignedGroupId: input.ticket.assignedGroupId,
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
