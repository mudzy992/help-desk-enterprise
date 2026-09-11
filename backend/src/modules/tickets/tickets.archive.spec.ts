import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';
import { ticketSystemEventActions } from './collaboration.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket auto-archive', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agent = { actorUserId: ticketsTestIds.agentIt };

  it('archives closed tickets after the configured delay without deleting data', async () => {
    const harness = await routedClosed();
    const closedAt = new Date('2026-08-11T12:00:00.000Z');
    const current = harness.memory.tickets.get(harness.ticketId)!;
    harness.memory.tickets.set(harness.ticketId, { ...current, closedAt });
    await harness.collaboration.createMessage(
      harness.ticketId,
      { type: 'INTERNAL_NOTE', body: 'Keep this note' },
      agent,
    );
    const processed = await harness.archiveAutomation.processDue(
      new Date('2026-09-11T12:00:00.000Z'),
    );
    expect(processed).toHaveLength(1);
    const archived = await harness.tickets.getById(harness.ticketId, agent);
    expect(archived.status).toBe('ARCHIVED');
    expect(archived.archivedAt).not.toBeNull();
    expect(
      [...harness.memory.messages.values()].some(
        (item) =>
          item.ticketId === harness.ticketId &&
          item.body === ticketSystemEventActions.ticketArchived,
      ),
    ).toBe(true);
    expect(
      [...harness.memory.messages.values()].some(
        (item) => item.body === 'Keep this note',
      ),
    ).toBe(true);
    await expect(
      harness.tickets.update(harness.ticketId, { title: 'nope' }, agent),
    ).rejects.toMatchObject({ response: { code: 'TICKET_ARCHIVED_READ_ONLY' } });
    await expect(
      harness.collaboration.createMessage(
        harness.ticketId,
        { type: 'INTERNAL_NOTE', body: 'blocked' },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'TICKET_ARCHIVED_READ_ONLY' } });
    const active = await harness.tickets.list({}, agent);
    expect(active.some((item) => item.id === harness.ticketId)).toBe(false);
    const listed = await harness.tickets.list({ status: 'ARCHIVED' }, requester);
    expect(listed.some((item) => item.id === harness.ticketId)).toBe(true);
  });

  it('is idempotent under concurrent sweeps and skips when disabled', async () => {
    const harness = await routedClosed();
    const current = harness.memory.tickets.get(harness.ticketId)!;
    harness.memory.tickets.set(harness.ticketId, {
      ...current,
      closedAt: new Date('2026-08-01T12:00:00.000Z'),
    });
    const now = new Date('2026-09-11T12:00:00.000Z');
    const [first, second] = await Promise.all([
      harness.archiveAutomation.processDue(now),
      harness.archiveAutomation.processDue(now),
    ]);
    expect(first.length + second.length).toBe(1);
    expect(harness.memory.tickets.get(harness.ticketId)?.status).toBe('ARCHIVED');
    const disabled = await routedClosed();
    disabled.archiveConfig.enabled = false;
    const disabledCurrent = disabled.memory.tickets.get(disabled.ticketId)!;
    disabled.memory.tickets.set(disabled.ticketId, {
      ...disabledCurrent,
      closedAt: new Date('2026-08-01T12:00:00.000Z'),
    });
    await disabled.archiveAutomation.processDue(now);
    expect(disabled.memory.tickets.get(disabled.ticketId)?.status).toBe('CLOSED');
  });
});

async function routedClosed() {
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
  await harness.tickets.update(
    created.id,
    { status: 'CLOSED' },
    { actorUserId: ticketsTestIds.agentIt },
  );
  return { ...harness, ticketId: created.id };
}
