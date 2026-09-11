import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsService authorization and status guards', () => {
  it('hides other-OU tickets from requesters and foreign agents', async () => {
    const { tickets } = createTicketsServiceHarness();
    const itTicket = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const listedForHr = await tickets.list(
      {},
      { actorUserId: ticketsTestIds.agentHr },
    );
    expect(listedForHr).toEqual([]);
    await expect(
      tickets.getById(itTicket.id, { actorUserId: ticketsTestIds.agentHr }),
    ).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    const listedForItAgent = await tickets.list(
      {},
      { actorUserId: ticketsTestIds.agentIt },
    );
    expect(listedForItAgent.map((item) => item.id)).toEqual([itTicket.id]);
  });

  it('rejects requester status changes and invalid handler transitions', async () => {
    const { tickets } = createTicketsServiceHarness();
    const created = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    await expect(
      tickets.update(
        created.id,
        { status: 'IN_PROGRESS' },
        { actorUserId: ticketsTestIds.requester },
      ),
    ).rejects.toMatchObject({
      response: { code: 'STATUS_CHANGE_FORBIDDEN' },
    });
    await expect(
      tickets.update(
        created.id,
        { status: 'CLOSED' },
        { actorUserId: ticketsTestIds.agentIt },
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });
  });

  it('allows a valid handler transition on a scoped ticket', async () => {
    const { tickets, routing } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    const created = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const progressed = await tickets.update(
      created.id,
      { status: 'IN_PROGRESS' },
      { actorUserId: ticketsTestIds.agentIt },
    );
    expect(progressed.status).toBe('IN_PROGRESS');
  });

  it('does not let an IT requester create into HR', async () => {
    const { tickets } = createTicketsServiceHarness();
    await expect(
      tickets.create(
        vpnCreateInput({ originUnitId: ticketsTestIds.ouHr }),
        { actorUserId: ticketsTestIds.requester },
      ),
    ).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
  });

  it('requires originUnitId when SuperAdmin has no home OU', async () => {
    const { tickets } = createTicketsServiceHarness();
    await expect(
      tickets.create(vpnCreateInput({ originUnitId: undefined }), {
        actorUserId: ticketsTestIds.superAdmin,
      }),
    ).rejects.toMatchObject({
      response: { code: 'ORIGIN_UNIT_REQUIRED' },
    });
  });

  it('lets SuperAdmin create when originUnitId is supplied', async () => {
    const { tickets } = createTicketsServiceHarness();
    const created = await tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.superAdmin,
    });
    expect(created.originUnitId).toBe(ticketsTestIds.ouIt);
    expect(created.requesterId).toBe(ticketsTestIds.superAdmin);
  });
});
