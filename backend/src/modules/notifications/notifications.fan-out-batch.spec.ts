import { fanOutInAppNotifications } from './fan-out/fan-out-in-app-notifications';
import { publishCreatedNotifications } from './fan-out/publish-created-notifications';
import { listNotifications } from './list-notifications';
import { markNotificationRead } from './mark-notification-read';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../tickets/create-tickets-service-harness';
import { ticketSystemEventActions } from '../tickets/collaboration.constants';
import { toTicketRealtimePayload } from '../tickets/to-collaboration-response';
import { vpnCreateInput } from '../tickets/vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const groupMemberCount = 200;
/** The routing scenario also puts the standard IT agent in the group. */
const audienceSize = groupMemberCount + 1;

/**
 * Option A (2026-09-24, group of 50+ assumed): a ticket-created event for a group
 * of 200 agents writes ONE group row and emits ONE group-room event — cost no
 * longer grows with the group. Each member still sees it in their inbox and reads
 * it independently (per-user `NotificationReceipt`).
 */
describe('notification fan-out with a large group (option A)', () => {
  it('writes one group row and emits once into the group room', async () => {
    const harness = await createTicketsServiceHarnessWithLargeGroup();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const create = jest.spyOn(harness.memory.prisma.notification, 'create');
    const createMany = jest.spyOn(
      harness.memory.prisma.notification,
      'createMany',
    );
    const publishNotification = jest.fn();
    const publishGroupNotification = jest.fn();
    const bump = jest.fn(async () => undefined);
    const created = await ingestTicketCreatedEvent(harness);
    await publishCreatedNotifications(
      harness.memory.prisma as never,
      { publishNotification, publishGroupNotification } as never,
      created,
      async () => undefined,
      bump,
    );

    expect(created.personal).toHaveLength(0);
    expect(created.group?.groupId).toBe(ticketsTestIds.groupIt);
    expect(created.group?.excludedUserIds).toContain(ticketsTestIds.requester);
    expect(create).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0]?.[0]?.data).toHaveLength(1);
    expect(bump).toHaveBeenCalledWith(ticketsTestIds.groupIt);
    expect(publishGroupNotification).toHaveBeenCalledTimes(1);
    expect(publishNotification).not.toHaveBeenCalled();
  });

  it('shows the event in every member inbox and reads it per user', async () => {
    const harness = await createTicketsServiceHarnessWithLargeGroup();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await ingestTicketCreatedEvent(harness);
    const prisma = harness.memory.prisma as never;
    const first = await listNotifications(prisma, 'agent-batch-0');
    const last = await listNotifications(
      prisma,
      `agent-batch-${groupMemberCount - 1}`,
    );
    expect(first.items).toHaveLength(1);
    expect(first.unreadCount).toBe(1);
    expect(last.items).toHaveLength(1);
    // Same row, shared by the group.
    expect(last.items[0]?.id).toBe(first.items[0]?.id);

    await markNotificationRead(prisma, 'agent-batch-0', first.items[0]!.id);
    expect((await listNotifications(prisma, 'agent-batch-0')).unreadCount).toBe(0);
    expect(
      (await listNotifications(prisma, `agent-batch-${groupMemberCount - 1}`))
        .unreadCount,
    ).toBe(1);
  });

  it('hides the group row from an outsider', async () => {
    const harness = await createTicketsServiceHarnessWithLargeGroup();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await ingestTicketCreatedEvent(harness);
    const outsider = await listNotifications(
      harness.memory.prisma as never,
      'not-a-member',
    );
    expect(outsider.items).toHaveLength(0);
  });

  it('writes nothing new when the same event is ingested twice', async () => {
    const harness = await createTicketsServiceHarnessWithLargeGroup();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await ingestTicketCreatedEvent(harness);
    const created = await ingestTicketCreatedEvent(harness);
    expect(created).toEqual({ personal: [], group: null, quietUserIds: [] });
  });
});

async function createTicketsServiceHarnessWithLargeGroup() {
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
  for (let index = 0; index < groupMemberCount; index += 1) {
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: `agent-batch-${index}`,
    });
  }
  return harness;
}

/** Fans out the single ticket-created system event and returns what was written. */
async function ingestTicketCreatedEvent(
  harness: ReturnType<typeof createTicketsServiceHarness>,
) {
  const messages = [...harness.memory.messages.values()];
  const created = messages.find(
    (message) => message.body === ticketSystemEventActions.created,
  );
  const message = created ?? messages[0];
  if (message === undefined) {
    throw new Error('the harness did not record a ticket event');
  }
  const ticket = harness.memory.tickets.get(message.ticketId);
  if (ticket === undefined) {
    throw new Error('the harness did not record the ticket');
  }
  return fanOutInAppNotifications(
    harness.memory.prisma as never,
    toTicketRealtimePayload(message, ticket),
  );
}
