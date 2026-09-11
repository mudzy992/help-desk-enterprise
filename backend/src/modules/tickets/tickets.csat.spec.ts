import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';
import { ticketSystemEventActions } from './collaboration.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket CSAT feedback', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agent = { actorUserId: ticketsTestIds.agentIt };

  it('accepts one requester rating on RESOLVED and rejects duplicates', async () => {
    const harness = await routedResolved();
    const first = await harness.csat.submit(
      harness.ticketId,
      { rating: 5, comment: 'Brzo riješeno' },
      requester,
    );
    expect(first.csat).toMatchObject({
      enabled: true,
      canSubmit: false,
      submitted: true,
      rating: 5,
      comment: 'Brzo riješeno',
    });
    await expect(
      harness.csat.submit(harness.ticketId, { rating: 1 }, requester),
    ).rejects.toMatchObject({ response: { code: 'CSAT_ALREADY_SUBMITTED' } });
    const summary = await harness.csat.summarize(agent);
    expect(summary.count).toBe(1);
    expect(summary.average).toBe(5);
    expect(summary.byService[0]?.key).toBe(ticketsTestIds.serviceVpn);
    const events = [...harness.memory.messages.values()].map((item) => item.body);
    expect(events.some((body) => body.startsWith(ticketSystemEventActions.csatSubmitted))).toBe(
      true,
    );
  });

  it('blocks agents, closed-by-default, and disabled addon submissions', async () => {
    const harness = await routedResolved();
    await expect(
      harness.csat.submit(harness.ticketId, { rating: 4 }, agent),
    ).rejects.toMatchObject({ response: { code: 'CSAT_NOT_ELIGIBLE' } });
    await harness.tickets.update(harness.ticketId, { status: 'CLOSED' }, agent);
    await expect(
      harness.csat.submit(harness.ticketId, { rating: 4 }, requester),
    ).rejects.toMatchObject({ response: { code: 'CSAT_NOT_ELIGIBLE' } });
    const disabled = await routedResolved();
    disabled.csatConfig.enabled = false;
    await expect(
      disabled.csat.submit(disabled.ticketId, { rating: 5 }, requester),
    ).rejects.toMatchObject({ response: { code: 'CSAT_DISABLED' } });
  });
});

async function routedResolved() {
  const harness = createTicketsServiceHarness();
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
    {
      status: 'RESOLVED',
      closeCode: 'bug_fixed',
      resolutionNote: 'VPN restored',
    },
    { actorUserId: ticketsTestIds.agentIt },
  );
  return { ...harness, ticketId: created.id };
}
