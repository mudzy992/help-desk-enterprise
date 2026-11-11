import { fanOutInAppNotifications } from './fan-out/fan-out-in-app-notifications';
import { notificationTypes } from './notifications.constants';
import { listNotifications } from './list-notifications';
import { markAllNotificationsRead } from './mark-all-notifications-read';
import { markNotificationRead } from './mark-notification-read';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../tickets/create-tickets-service-harness';
import { toTicketRealtimePayload } from '../tickets/to-collaboration-response';
import { vpnCreateInput } from '../tickets/vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('in-app notification fan-out', () => {
  it('notifies group members of a new ticket and skips the requester', async () => {
    const harness = await routedWithGroupMember();
    const created = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await ingestTicketMessages(harness);
    const agentInbox = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.agentIt,
    );
    const requesterInbox = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.requester,
    );
    expect(agentInbox.items.map((item) => item.type)).toEqual([
      notificationTypes.ticketCreated,
    ]);
    expect(agentInbox.items[0]?.ticketId).toBe(created.id);
    expect(agentInbox.unreadCount).toBe(1);
    expect(requesterInbox.items).toEqual([]);
  });

  it('ignores a duplicate ingest of the same ticket event', async () => {
    const harness = await routedWithGroupMember();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await ingestTicketMessages(harness);
    await ingestTicketMessages(harness);
    const inbox = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.agentIt,
    );
    expect(inbox.items).toHaveLength(1);
    expect(inbox.unreadCount).toBe(1);
  });

  it('notifies the requester of an agent reply, not the author', async () => {
    const harness = await routedWithGroupMember();
    const created = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await harness.collaboration.createMessage(
      created.id,
      { type: 'AGENT_REPLY', body: 'Checking the concentrator' },
      { actorUserId: ticketsTestIds.agentIt },
    );
    await ingestTicketMessages(harness);
    const requesterInbox = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.requester,
    );
    const agentInbox = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.agentIt,
    );
    expect(requesterInbox.items.some((item) => item.type === notificationTypes.ticketMessage)).toBe(
      true,
    );
    expect(agentInbox.items.some((item) => item.type === notificationTypes.ticketMessage)).toBe(
      false,
    );
  });

  it('notifies the requester when the ticket is resolved', async () => {
    const harness = await routedWithGroupMember();
    const created = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await harness.tickets.update(
      created.id,
      { status: 'IN_PROGRESS' },
      { actorUserId: ticketsTestIds.agentIt },
    );
    await harness.tickets.update(
      created.id,
      { status: 'RESOLVED', closeCode: 'bug_fixed', resolutionNote: 'Fixed' },
      { actorUserId: ticketsTestIds.agentIt },
    );
    await ingestTicketMessages(harness);
    const requesterInbox = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.requester,
    );
    expect(requesterInbox.items.map((item) => item.type)).toContain(
      notificationTypes.ticketResolved,
    );
  });
});

describe('in-app notification isolation', () => {
  it('lists and marks only the signed-in user inbox', async () => {
    const harness = await routedWithGroupMember();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await ingestTicketMessages(harness);
    const other = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.agentHr,
    );
    expect(other.items).toEqual([]);
    const agentItems = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.agentIt,
    );
    await expect(
      markNotificationRead(
        harness.memory.prisma as never,
        ticketsTestIds.agentHr,
        agentItems.items[0]?.id ?? '',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const marked = await markNotificationRead(
      harness.memory.prisma as never,
      ticketsTestIds.agentIt,
      agentItems.items[0]?.id ?? '',
    );
    expect(marked.isRead).toBe(true);
    await markAllNotificationsRead(
      harness.memory.prisma as never,
      ticketsTestIds.agentIt,
    );
    const after = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.agentIt,
      { unreadOnly: true },
    );
    expect(after.items).toEqual([]);
    expect(after.unreadCount).toBe(0);
  });
});

async function routedWithGroupMember() {
  const harness = createTicketsServiceHarness();
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  harness.memory.seedGroupMember({
    groupId: ticketsTestIds.groupIt,
    userId: ticketsTestIds.agentIt,
  });
  return harness;
}

async function ingestTicketMessages(
  harness: ReturnType<typeof createTicketsServiceHarness>,
): Promise<void> {
  for (const message of harness.memory.messages.values()) {
    const ticket = harness.memory.tickets.get(message.ticketId);
    if (ticket === undefined) {
      continue;
    }
    await fanOutInAppNotifications(
      harness.memory.prisma as never,
      toTicketRealtimePayload(message, ticket),
    );
  }
}
