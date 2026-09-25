import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket bulk actions', () => {
  const agent = { actorUserId: ticketsTestIds.agentIt };
  const admin = { actorUserId: ticketsTestIds.adminIt };

  it('assigns a group in the same OU/group and forbids bulk close', async () => {
    const harness = createTicketsServiceHarness();
    const [first, second] = await createPair(harness);
    const assigned = await harness.bulk.execute(
      {
        ticketIds: [first.id, second.id],
        actionType: 'assign_group',
        assignedGroupId: ticketsTestIds.groupIt,
      },
      admin,
    );
    expect(assigned.tickets.every((item) => item.assignedGroupId === ticketsTestIds.groupIt)).toBe(
      true,
    );
    await expect(
      harness.bulk.execute(
        {
          ticketIds: [first.id, second.id],
          actionType: 'set_status',
          status: 'CLOSED',
          reason: 'done',
        },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'BULK_CLOSE_FORBIDDEN' } });
  });

  it('requires the same OU/group for agents and a reason for status/priority', async () => {
    const harness = createTicketsServiceHarness();
    const unrouted = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await harness.routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    const routed = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await expect(
      harness.bulk.execute(
        {
          ticketIds: [unrouted.id, routed.id],
          actionType: 'assign_group',
          assignedGroupId: ticketsTestIds.groupIt,
        },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'BULK_SCOPE_MISMATCH' } });
    await expect(
      harness.bulk.execute(
        {
          ticketIds: [routed.id],
          actionType: 'set_status',
          status: 'IN_PROGRESS',
        },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'BULK_REASON_REQUIRED' } });
    const prioritized = await harness.bulk.execute(
      {
        ticketIds: [routed.id],
        actionType: 'set_priority',
        priority: 'CRITICAL',
        reason: 'Incident blast radius',
      },
      admin,
    );
    expect(prioritized.tickets[0].priority).toBe('CRITICAL');
  });

  it('broadcasts a structured update after preview and merges into a parent', async () => {
    const harness = createTicketsServiceHarness();
    const [first, second] = await createPair(harness);
    const preview = await harness.bulk.preview([first.id, second.id], admin);
    expect(preview.ticketCount).toBe(2);
    expect(preview.requiresConfirmation).toBe(true);
    const broadcast = await harness.bulk.execute(
      {
        ticketIds: [first.id, second.id],
        actionType: 'broadcast_message',
        previewConfirmed: true,
        whatHappened: 'VPN outage',
        whoAffected: 'IT campus',
        eta: '30m',
      },
      admin,
    );
    expect(broadcast.recipientCount).toBeGreaterThan(0);
    const merged = await harness.bulk.execute(
      {
        ticketIds: [first.id, second.id],
        actionType: 'merge_into_parent',
        parentTicketId: first.id,
        reason: 'Same VPN outage',
      },
      admin,
    );
    expect(
      merged.tickets.find((item) => item.id === second.id)?.mergedIntoTicketId,
    ).toBe(first.id);
  });
});

async function createPair(
  harness: ReturnType<typeof createTicketsServiceHarness>,
) {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const first = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  const second = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  return [first, second] as const;
}
