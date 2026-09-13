import { fanOutInAppNotifications } from './fan-out/fan-out-in-app-notifications';
import { listNotifications } from './list-notifications';
import { notificationTypes } from './notifications.constants';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../tickets/create-tickets-service-harness';
import { toTicketRealtimePayload } from '../tickets/to-collaboration-response';
import { vpnCreateInput } from '../tickets/vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SLA in-app notification ingest', () => {
  it('notifies group members from an SLA SYSTEM_EVENT', async () => {
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
    const created = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const ticket = harness.memory.tickets.get(created.id);
    const message = await harness.memory.prisma.ticketMessage.create({
      data: {
        ticketId: created.id,
        type: 'SYSTEM_EVENT',
        body: ticketSystemEventActions.slaResponseBreached,
        authorUserId: null,
      },
    });
    await fanOutInAppNotifications(
      harness.memory.prisma as never,
      toTicketRealtimePayload(message, ticket!),
    );
    const inbox = await listNotifications(
      harness.memory.prisma as never,
      ticketsTestIds.agentIt,
    );
    expect(inbox.items.map((item) => item.type)).toContain(
      notificationTypes.ticketSla,
    );
  });
});
