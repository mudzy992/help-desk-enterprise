import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket close codes and required fields', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agent = { actorUserId: ticketsTestIds.agentIt };

  it('requires close code and resolution note before RESOLVED', async () => {
    const harness = await routedInProgress();
    await expect(
      harness.tickets.update(harness.ticketId, { status: 'RESOLVED' }, agent),
    ).rejects.toMatchObject({
      response: { code: 'REQUIRED_FIELDS_MISSING' },
    });
  });

  it('persists an allow-listed close code on resolve', async () => {
    const harness = await routedInProgress();
    const resolved = await harness.tickets.update(
      harness.ticketId,
      {
        status: 'RESOLVED',
        closeCode: 'bug_fixed',
        resolutionNote: 'VPN concentrator restored',
      },
      agent,
    );
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.closePolicy?.closeCode?.key).toBe('bug_fixed');
    expect(resolved.closePolicy?.resolutionNote).toBe(
      'VPN concentrator restored',
    );
    const closed = await harness.tickets.update(
      harness.ticketId,
      { status: 'CLOSED' },
      agent,
    );
    expect(closed.status).toBe('CLOSED');
    expect(closed.closePolicy?.closeCode?.key).toBe('bug_fixed');
  });

  it('rejects a close code outside the allow-list', async () => {
    const harness = await routedInProgress();
    await expect(
      harness.tickets.update(
        harness.ticketId,
        {
          status: 'RESOLVED',
          closeCode: 'not_a_real_code',
          resolutionNote: 'done',
        },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'CLOSE_CODE_INVALID' } });
  });
});

async function routedInProgress() {
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
  return { ...harness, ticketId: created.id };
}
