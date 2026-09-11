import { ticketSystemEventActions } from './collaboration.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('anti-loop and anti-spam guardrails', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const admin = { actorUserId: ticketsTestIds.adminIt };

  it('warns on a similar ticket in warn_only mode', async () => {
    const harness = createTicketsServiceHarness();
    const first = await harness.tickets.create(vpnCreateInput(), requester);
    const second = await harness.tickets.create(
      vpnCreateInput({ description: 'Cannot connect from the office!' }),
      requester,
    );
    expect(second.duplicateWarnings?.some((item) => item.ticketId === first.id)).toBe(
      true,
    );
    const messages = [...harness.memory.messages.values()].filter(
      (item) => item.ticketId === second.id,
    );
    expect(
      messages.some((item) =>
        item.body.startsWith(ticketSystemEventActions.guardrailDuplicateWarned),
      ),
    ).toBe(true);
  });

  it('soft-blocks an unacknowledged duplicate and allows acknowledge', async () => {
    const harness = createTicketsServiceHarness();
    harness.guardrailsConfig.mode = 'soft_block';
    await harness.tickets.create(vpnCreateInput(), requester);
    await expect(harness.tickets.create(vpnCreateInput(), requester)).rejects.toMatchObject({
      response: { code: 'DUPLICATE_TICKET_BLOCKED' },
    });
    const created = await harness.tickets.create(
      vpnCreateInput({ acknowledgeDuplicate: true }),
      requester,
    );
    expect(created.duplicateWarnings?.length).toBeGreaterThan(0);
  });

  it('soft-blocks concurrent identical creates so only one succeeds', async () => {
    const harness = createTicketsServiceHarness();
    harness.guardrailsConfig.mode = 'soft_block';
    const results = await Promise.allSettled([
      harness.tickets.create(vpnCreateInput(), requester),
      harness.tickets.create(vpnCreateInput(), requester),
    ]);
    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    const rejected = results.filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: 'rejected',
      reason: { response: { code: 'DUPLICATE_TICKET_BLOCKED' } },
    });
  });

  it('emits a waiting-for-user reminder only once under concurrent sweeps', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createWaitingTicket(harness);
    const enteredAt = new Date(
      harness.memory.tickets.get(ticketId)!.waitingForUserEnteredAt!,
    );
    const due = new Date(enteredAt.getTime() + 2 * 24 * 60 * 60 * 1000);
    await Promise.all([
      harness.waitingAutomation.processDue(due),
      harness.waitingAutomation.processDue(due),
    ]);
    const reminderEvents = [...harness.memory.messages.values()].filter(
      (item) =>
        item.ticketId === ticketId &&
        item.body === ticketSystemEventActions.waitingForUserReminder,
    );
    expect(reminderEvents).toHaveLength(1);
  });

  it('requires extra confirmation when a bulk broadcast exceeds the recipient threshold', async () => {
    const harness = createTicketsServiceHarness();
    harness.guardrailsConfig.confirmAboveRecipients = 1;
    const [first, second] = await createRoutedPair(harness);
    const preview = await harness.bulk.preview([first.id, second.id], admin);
    expect(preview.requiresBroadcastConfirmation).toBe(true);
    await expect(
      harness.bulk.execute(
        {
          ticketIds: [first.id, second.id],
          actionType: 'broadcast_message',
          previewConfirmed: true,
          whatHappened: 'VPN outage',
          whoAffected: 'IT campus',
          eta: '30m',
        },
        admin,
      ),
    ).rejects.toMatchObject({
      response: { code: 'BULK_BROADCAST_CONFIRMATION_REQUIRED' },
    });
    const sent = await harness.bulk.execute(
      {
        ticketIds: [first.id, second.id],
        actionType: 'broadcast_message',
        previewConfirmed: true,
        broadcastConfirmed: true,
        whatHappened: 'VPN outage',
        whoAffected: 'IT campus',
        eta: '30m',
      },
      admin,
    );
    expect(sent.recipientCount).toBeGreaterThan(0);
  });
});

async function createWaitingTicket(
  harness: ReturnType<typeof createTicketsServiceHarness>,
): Promise<string> {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
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
    { status: 'WAITING_FOR_USER' },
    { actorUserId: ticketsTestIds.agentIt },
  );
  return created.id;
}

async function createRoutedPair(
  harness: ReturnType<typeof createTicketsServiceHarness>,
) {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const first = await harness.tickets.create(
    vpnCreateInput({ description: 'First campus VPN outage report' }),
    { actorUserId: ticketsTestIds.requester },
  );
  const second = await harness.tickets.create(
    vpnCreateInput({ description: 'Second campus VPN outage report' }),
    { actorUserId: ticketsTestIds.requester },
  );
  patchAssignedUser(harness, first.id, ticketsTestIds.agentIt);
  patchAssignedUser(harness, second.id, ticketsTestIds.agentItPeer);
  return [first, second] as const;
}

function patchAssignedUser(
  harness: ReturnType<typeof createTicketsServiceHarness>,
  ticketId: string,
  assignedUserId: string,
): void {
  const current = harness.memory.tickets.get(ticketId);
  if (current === undefined) {
    throw new Error('ticket missing');
  }
  harness.memory.tickets.set(ticketId, { ...current, assignedUserId });
}
