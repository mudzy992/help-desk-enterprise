import { fanOutInAppNotifications } from './fan-out/fan-out-in-app-notifications';
import { publishCreatedNotifications } from './fan-out/publish-created-notifications';
import { listNotifications } from './list-notifications';
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
 * Phase 2.3 (plan §2.3) verification: a message for a group of 200 agents costs
 * a constant number of statements, and every member still sees the notification
 * in their own inbox.
 *
 * Statement budget per event (was: one INSERT per member + one count per member):
 *   1 × `findMany` (which recipients already have this exact event)
 *   1 × `createMany` (all recipients, one statement)
 *   1 × `groupBy`   (the unread badge of every recipient, one statement)
 * plus one emit per recipient (see the note in the test below).
 */
describe('notification fan-out with a large group', () => {
  it('writes a 200-member audience with one batch insert', async () => {
    const harness = await createTicketsServiceHarnessWithLargeGroup();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const create = jest.spyOn(harness.memory.prisma.notification, 'create');
    const createMany = jest.spyOn(
      harness.memory.prisma.notification,
      'createMany',
    );
    const findMany = jest.spyOn(harness.memory.prisma.notification, 'findMany');
    const groupBy = jest.spyOn(harness.memory.prisma.notification, 'groupBy');
    const publishNotification = jest.fn();
    const created = await ingestTicketCreatedEvent(harness);
    await publishCreatedNotifications(
      harness.memory.prisma as never,
      { publishNotification } as never,
      created,
    );

    expect(created).toHaveLength(audienceSize);
    expect(create).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0]?.[0]?.data).toHaveLength(audienceSize);
    // The badge of every recipient is one statement, not one per recipient.
    expect(groupBy).toHaveBeenCalledTimes(1);
    // Emits stay per recipient on purpose: the row id is what `POST
    // /notifications/:id/read` authorizes against, so each member needs their own
    // (see the decision note in the F2 report).
    expect(publishNotification).toHaveBeenCalledTimes(audienceSize);
  });

  it('shows the event once in every member inbox, still isolated per user', async () => {
    const harness = await createTicketsServiceHarnessWithLargeGroup();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await ingestTicketCreatedEvent(harness);
    const first = await listNotifications(
      harness.memory.prisma as never,
      'agent-batch-0',
    );
    const last = await listNotifications(
      harness.memory.prisma as never,
      `agent-batch-${groupMemberCount - 1}`,
    );
    expect(first.items).toHaveLength(1);
    expect(first.unreadCount).toBe(1);
    expect(last.items).toHaveLength(1);
    expect(last.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('spends no extra statement when the same event is ingested twice', async () => {
    const harness = await createTicketsServiceHarnessWithLargeGroup();
    await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await ingestTicketCreatedEvent(harness);
    const createMany = jest.spyOn(
      harness.memory.prisma.notification,
      'createMany',
    );
    const created = await ingestTicketCreatedEvent(harness);
    expect(created).toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
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
