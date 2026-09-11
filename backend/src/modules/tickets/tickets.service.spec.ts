import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsService CRUD', () => {
  const actor = { actorUserId: ticketsTestIds.requester };

  it('creates a routed ticket with calculated priority and formVersionRef', async () => {
    const { tickets, routing } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    const created = await tickets.create(vpnCreateInput(), actor);
    expect(created.status).toBe('PENDING');
    expect(created.assignedGroupId).toBe(ticketsTestIds.groupIt);
    expect(created.assignedUserId).toBeNull();
    expect(created.priority).toBe('HIGH');
    expect(created.formVersionRef).toBe(ticketsTestIds.formVpnV1);
    expect(created.requesterId).toBe(ticketsTestIds.requester);
    const loaded = await tickets.getById(created.id, actor);
    expect(loaded.ticketNumber).toBe(created.ticketNumber);
    const listed = await tickets.list({}, actor);
    expect(listed.map((item) => item.id)).toEqual([created.id]);
    const renamed = await tickets.update(
      created.id,
      { title: 'VPN restored slowly' },
      actor,
    );
    expect(renamed.title).toBe('VPN restored slowly');
    expect(renamed.priority).toBe('HIGH');
  });

  it('keeps UNROUTED when routing has no match and does not invent a group', async () => {
    const { tickets } = createTicketsServiceHarness();
    const created = await tickets.create(vpnCreateInput(), actor);
    expect(created.status).toBe('UNROUTED');
    expect(created.assignedGroupId).toBeNull();
  });

  it('recalculates priority when impact or urgency changes', async () => {
    const { tickets } = createTicketsServiceHarness();
    const created = await tickets.create(
      vpnCreateInput({ impact: 'LOW', urgency: 'LOW' }),
      actor,
    );
    expect(created.priority).toBe('LOW');
    const updated = await tickets.update(
      created.id,
      { impact: 'CRITICAL', urgency: 'HIGH' },
      actor,
    );
    expect(updated.priority).toBe('CRITICAL');
    expect(updated.impact).toBe('CRITICAL');
    expect(updated.urgency).toBe('HIGH');
  });

  it('persists the selected formVersionRef and does not follow later versions', async () => {
    const { tickets, memory } = createTicketsServiceHarness();
    const created = await tickets.create(
      vpnCreateInput({ formVersionRef: ticketsTestIds.formVpnV1 }),
      actor,
    );
    const now = new Date('2026-09-11T13:00:00.000Z');
    memory.seedFormVersion({
      id: ticketsTestIds.formVpnV2,
      serviceId: ticketsTestIds.serviceVpn,
      version: 2,
      schema: { schemaVersion: 1, fields: [] },
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    await memory.prisma.formVersion.update({
      where: { id: ticketsTestIds.formVpnV1 },
      data: { status: 'RETIRED' },
    });
    const loaded = await tickets.getById(created.id, actor);
    expect(loaded.formVersionRef).toBe(ticketsTestIds.formVpnV1);
    const next = await tickets.create(vpnCreateInput(), actor);
    expect(next.formVersionRef).toBe(ticketsTestIds.formVpnV2);
  });

  it('rejects a formVersionRef from another service', async () => {
    const { tickets } = createTicketsServiceHarness();
    await expect(
      tickets.create(
        vpnCreateInput({ formVersionRef: ticketsTestIds.formOther }),
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'FORM_VERSION_SERVICE_MISMATCH' },
    });
  });

  it('rejects tickets for services that are not ACTIVE', async () => {
    const { tickets } = createTicketsServiceHarness();
    await expect(
      tickets.create(
        vpnCreateInput({ serviceId: ticketsTestIds.serviceDraft }),
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SERVICE_NOT_OFFERED' },
    });
  });
});
