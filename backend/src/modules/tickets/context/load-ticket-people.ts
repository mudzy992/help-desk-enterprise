import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { canViewTicketMessage } from '../ticket-message-visibility';
import { readSystemEventTargetUserId } from './public-activity.constants';
import type { TicketMutationContext } from '../tickets.types';
import type {
  TicketGroupRef,
  TicketPeopleResponse,
  TicketPersonRef,
} from './context.types';

type IdCollector = {
  readonly users: Set<string>;
  readonly groups: Set<string>;
};

function addUser(collector: IdCollector, id: string | null | undefined): void {
  if (typeof id === 'string' && id.length > 0) {
    collector.users.add(id);
  }
}

/**
 * Names for every person and group a ticket refers to, restricted to what the
 * caller may already see: requesters only get the people behind content they
 * can read, never the authors of internal notes or time logs.
 */
export async function loadTicketPeople(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<TicketPeopleResponse> {
  const { ticket, access } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const isStaff = access.visibility === 'staff';
  const collector: IdCollector = { users: new Set(), groups: new Set() };
  addUser(collector, ticket.requesterId);
  addUser(collector, ticket.assignedUserId);
  if (ticket.assignedGroupId !== null) {
    collector.groups.add(ticket.assignedGroupId);
  }
  const [participants, messages, attachments, approvals, timeLogs] =
    await Promise.all([
      prisma.ticketParticipant.findMany({
        where: { ticketId },
        select: { userId: true, groupId: true },
      }),
      prisma.ticketMessage.findMany({
        where: { ticketId },
        select: { authorUserId: true, type: true, body: true },
      }),
      prisma.ticketAttachment.findMany({
        where: { ticketId },
        select: { uploadedByUserId: true },
      }),
      prisma.ticketApproval.findMany({
        where: { ticketId },
        select: { approverUserId: true },
      }),
      isStaff
        ? prisma.ticketTimeLog.findMany({
            where: { ticketId },
            select: { userId: true },
          })
        : Promise.resolve([] as { userId: string }[]),
    ]);
  for (const participant of participants) {
    addUser(collector, participant.userId);
    if (participant.groupId !== null) {
      collector.groups.add(participant.groupId);
    }
  }
  for (const message of messages) {
    if (canViewTicketMessage(access.visibility, message.type)) {
      addUser(collector, message.authorUserId);
      if (message.type === 'SYSTEM_EVENT') {
        addUser(collector, readSystemEventTargetUserId(message.body));
      }
    }
  }
  for (const attachment of attachments) {
    addUser(collector, attachment.uploadedByUserId);
  }
  for (const approval of approvals) {
    addUser(collector, approval.approverUserId);
  }
  for (const timeLog of timeLogs) {
    addUser(collector, timeLog.userId);
  }
  return {
    users: await loadPersonRefs(prisma, [...collector.users]),
    groups: await loadGroupRefs(prisma, [...collector.groups]),
  };
}

export async function loadPersonRefs(
  prisma: PrismaService,
  ids: readonly string[],
): Promise<readonly TicketPersonRef[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = (await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, displayName: true },
  })) as TicketPersonRef[];
  return rows.map((row) => ({ id: row.id, displayName: row.displayName }));
}

export async function loadGroupRefs(
  prisma: PrismaService,
  ids: readonly string[],
): Promise<readonly TicketGroupRef[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = (await prisma.group.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true },
  })) as TicketGroupRef[];
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
