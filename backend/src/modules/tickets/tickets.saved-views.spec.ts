import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket saved views', () => {
  const agent = { actorUserId: ticketsTestIds.agentIt };
  const other = { actorUserId: ticketsTestIds.adminIt };

  it('stores per-user filters, default view, and rejects another user', async () => {
    const harness = createTicketsServiceHarness();
    const created = await harness.savedViews.create(
      {
        name: 'My high',
        filters: { priority: 'HIGH', search: 'vpn', overdue: true },
        sort: { field: 'updatedAt', direction: 'desc' },
        columns: ['number', 'subject', 'priority'],
        isDefault: true,
      },
      agent,
    );
    expect(created.isDefault).toBe(true);
    expect(created.filters.priority).toBe('HIGH');
    expect(created.filters.overdue).toBe(true);
    const listed = await harness.savedViews.list(agent);
    expect(listed).toHaveLength(1);
    await expect(harness.savedViews.list(other)).resolves.toEqual([]);
    await expect(
      harness.savedViews.update(created.id, { name: 'Taken' }, other),
    ).rejects.toMatchObject({ response: { code: 'SAVED_VIEW_NOT_FOUND' } });
  });

  it('clears sort only for explicit null and preserves it when omitted', async () => {
    const harness = createTicketsServiceHarness();
    const created = await harness.savedViews.create(
      {
        name: 'Sortable',
        filters: { status: 'PENDING' },
        sort: { field: 'updatedAt', direction: 'desc' },
      },
      agent,
    );
    const preserved = await harness.savedViews.update(
      created.id,
      { name: 'Still sortable' },
      agent,
    );
    expect(preserved.sort).toEqual({ field: 'updatedAt', direction: 'desc' });
    const cleared = await harness.savedViews.update(
      created.id,
      { sort: null },
      agent,
    );
    expect(cleared.sort).toBeNull();
    expect((await harness.savedViews.list(agent))[0]?.sort).toBeNull();
  });

  it('enforces the per-user limit and disabled flag', async () => {
    const harness = createTicketsServiceHarness();
    harness.savedViewsConfig.maxPerUser = 1;
    await harness.savedViews.create(
      { name: 'One', filters: { status: 'PENDING' } },
      agent,
    );
    await expect(
      harness.savedViews.create(
        { name: 'Two', filters: { status: 'ASSIGNED' } },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'SAVED_VIEW_LIMIT' } });
    harness.savedViewsConfig.enabled = false;
    await expect(harness.savedViews.list(agent)).rejects.toMatchObject({
      response: { code: 'SAVED_VIEWS_DISABLED' },
    });
  });
});
