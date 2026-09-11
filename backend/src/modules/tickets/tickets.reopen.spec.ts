import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket reopen policy', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agent = { actorUserId: ticketsTestIds.agentIt };

  it('reopens the same ticket inside the window and blocks PATCH shortcuts', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createResolvedTicket(harness);
    await expect(
      harness.tickets.update(ticketId, { status: 'IN_PROGRESS' }, agent),
    ).rejects.toMatchObject({ response: { code: 'REOPEN_REQUIRED' } });
    const reopened = await harness.reopen.reopen(ticketId, {}, requester);
    expect(reopened.id).toBe(ticketId);
    expect(reopened.status).toBe('IN_PROGRESS');
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.reopen?.createsNewTicket).toBe(false);
  });

  it('creates a linked ticket after the window and keeps the original closed', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createResolvedTicket(harness);
    await harness.tickets.update(ticketId, { status: 'CLOSED' }, agent);
    const closedAt = new Date(harness.memory.tickets.get(ticketId)!.closedAt!);
    const created = await harness.reopen.reopen(
      ticketId,
      { comment: 'Still broken' },
      requester,
      new Date(closedAt.getTime() + 7 * 24 * 60 * 60 * 1000 + 1),
    );
    expect(created.id).not.toBe(ticketId);
    expect(created.reopenedFromTicketId).toBe(ticketId);
    expect(created.requesterId).toBe(ticketsTestIds.requester);
    expect((await harness.tickets.getById(ticketId, agent)).status).toBe(
      'CLOSED',
    );
  });

  it('rejects reopen when the policy is disabled or the ticket is not resolved/closed', async () => {
    const harness = createTicketsServiceHarness();
    const pending = await createResolvedTicket(harness);
    harness.reopenConfig.enabled = false;
    await expect(
      harness.reopen.reopen(pending, {}, requester),
    ).rejects.toMatchObject({ response: { code: 'REOPEN_DISABLED' } });
    harness.reopenConfig.enabled = true;
    const open = await harness.tickets.create(vpnCreateInput(), requester);
    await expect(
      harness.reopen.reopen(open.id, {}, requester),
    ).rejects.toMatchObject({ response: { code: 'REOPEN_NOT_ELIGIBLE' } });
  });
});

async function createResolvedTicket(
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
    { status: 'RESOLVED' },
    { actorUserId: ticketsTestIds.agentIt },
  );
  return created.id;
}
