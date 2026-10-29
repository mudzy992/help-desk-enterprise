import { resolveNotificationRecipients } from './resolve-notification-recipients';
import { notificationTypes } from '../notifications.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../../tickets/create-tickets-service-harness';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('resolveNotificationRecipients ticket.message (pickup then mute queue)', () => {
  it('notifies the handling group while the ticket is unassigned', async () => {
    const harness = createTicketsServiceHarness();
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentIt,
    });
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentItPeer,
    });
    const recipients = await resolveNotificationRecipients(harness.memory.prisma as never, {
      type: notificationTypes.ticketMessage,
      actorUserId: ticketsTestIds.requester,
      ticket: {
        id: 'ticket-open-queue',
        requesterId: ticketsTestIds.requester,
        assignedUserId: null,
        assignedGroupId: ticketsTestIds.groupIt,
      } as never,
    });
    expect([...recipients].sort()).toEqual(
      [ticketsTestIds.agentIt, ticketsTestIds.agentItPeer].sort(),
    );
  });

  it('does not e-mail group peers once an agent owns the ticket', async () => {
    const harness = createTicketsServiceHarness();
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentIt,
    });
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentItPeer,
    });
    const recipients = await resolveNotificationRecipients(harness.memory.prisma as never, {
      type: notificationTypes.ticketMessage,
      actorUserId: ticketsTestIds.requester,
      ticket: {
        id: 'ticket-owned',
        requesterId: ticketsTestIds.requester,
        assignedUserId: ticketsTestIds.agentIt,
        assignedGroupId: ticketsTestIds.groupIt,
      } as never,
    });
    expect(recipients).toEqual([ticketsTestIds.agentIt]);
  });

  it('still e-mails the requester when the assignee writes a public reply', async () => {
    const harness = createTicketsServiceHarness();
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentItPeer,
    });
    const recipients = await resolveNotificationRecipients(harness.memory.prisma as never, {
      type: notificationTypes.ticketMessage,
      actorUserId: ticketsTestIds.agentIt,
      ticket: {
        id: 'ticket-owned-reply',
        requesterId: ticketsTestIds.requester,
        assignedUserId: ticketsTestIds.agentIt,
        assignedGroupId: ticketsTestIds.groupIt,
      } as never,
    });
    expect(recipients).toEqual([ticketsTestIds.requester]);
  });
});
