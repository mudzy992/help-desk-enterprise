import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import type { TicketMutationContext } from '../tickets.types';
import type { TicketPublicActivityEntry } from './context.types';
import { loadPersonRefs } from './load-ticket-people';
import {
  parseSystemEventBody,
  publicTicketSystemEventActions,
  readSystemEventTargetUserId,
} from './public-activity.constants';

/**
 * The part of a ticket's audit trail a requester is allowed to see: a curated
 * set of system events with resolved names and no internal detail.
 */
export async function loadTicketPublicActivity(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<readonly TicketPublicActivityEntry[]> {
  await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const events = await prisma.ticketMessage.findMany({
    where: { ticketId, type: 'SYSTEM_EVENT' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, body: true, authorUserId: true, createdAt: true },
  });
  const visible = events.filter((event) =>
    publicTicketSystemEventActions.has(parseSystemEventBody(event.body).action),
  );
  const userIds = new Set<string>();
  for (const event of visible) {
    if (event.authorUserId !== null) {
      userIds.add(event.authorUserId);
    }
    const target = readSystemEventTargetUserId(event.body);
    if (target !== null) {
      userIds.add(target);
    }
  }
  const people = await loadPersonRefs(prisma, [...userIds]);
  const names = new Map(people.map((person) => [person.id, person.displayName]));
  return visible.map((event) => {
    const target = readSystemEventTargetUserId(event.body);
    return {
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      action: parseSystemEventBody(event.body).action,
      actorName:
        event.authorUserId === null
          ? null
          : (names.get(event.authorUserId) ?? null),
      targetName: target === null ? null : (names.get(target) ?? null),
    };
  });
}
