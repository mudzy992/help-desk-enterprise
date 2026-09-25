import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import type {
  ForwardHistoryItem,
  TicketForwardEventRecord,
} from './forwarding.types';

/** `GET /tickets/:id/forward-history` — staff only, newest first. */
export async function listForwardHistory(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly ticketId: string;
  readonly context: TicketMutationContext;
}): Promise<readonly ForwardHistoryItem[]> {
  const { ticket, access } = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
  );
  if (access.visibility !== 'staff') {
    throw new TicketsError('FORBIDDEN');
  }
  const events = (await input.prisma.ticketForwardEvent.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })) as TicketForwardEventRecord[];
  if (events.length === 0) {
    return [];
  }
  const unitIds = [
    ...new Set(
      events.flatMap((event) =>
        [event.fromUnitId, event.toUnitId].filter(
          (id): id is string => id !== null,
        ),
      ),
    ),
  ];
  const userIds = [
    ...new Set(
      events.flatMap((event) =>
        [event.actorUserId, event.toUserId].filter(
          (id): id is string => id !== null,
        ),
      ),
    ),
  ];
  const [units, users] = await Promise.all([
    input.prisma.organizationalUnit.findMany({
      where: { id: { in: unitIds } },
      select: { id: true, name: true },
    }) as Promise<{ id: string; name: string }[]>,
    input.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true },
    }) as Promise<{ id: string; displayName?: string }[]>,
  ]);
  const unitName = new Map(units.map((unit) => [unit.id, unit.name]));
  const userName = new Map(
    users.map((user) => [user.id, user.displayName ?? null]),
  );
  return events.map((event) => ({
    id: event.id,
    fromGroupId: event.fromGroupId,
    fromGroupName: event.fromGroupName,
    fromUnitName:
      event.fromUnitId === null ? null : unitName.get(event.fromUnitId) ?? null,
    toGroupId: event.toGroupId,
    toGroupName: event.toGroupName,
    toUnitName: unitName.get(event.toUnitId) ?? null,
    toUserId: event.toUserId,
    toUserName:
      event.toUserId === null ? null : userName.get(event.toUserId) ?? null,
    actorUserId: event.actorUserId,
    actorName:
      event.actorUserId === null
        ? null
        : userName.get(event.actorUserId) ?? null,
    reason: event.reason,
    isCrossOu: event.isCrossOu,
    viaBulk: event.viaBulk,
    createdAt: event.createdAt.toISOString(),
  }));
}
