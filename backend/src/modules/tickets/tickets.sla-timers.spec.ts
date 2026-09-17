import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { seedTicketsSlaTimers } from './seed-tickets-sla-timers';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket SLA timer hooks', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agent = { actorUserId: ticketsTestIds.agentIt };

  it('starts on create, pauses on WAITING_FOR_USER, and resumes on user reply', async () => {
    const harness = createTicketsServiceHarness();
    await seedTicketsSlaTimers(harness);
    const created = await harness.tickets.create(vpnCreateInput(), requester);
    const started = slaState(harness, created.id);
    expect(started?.pausedAt).toBeNull();
    expect(started?.responseDueAt).not.toBeNull();
    await harness.tickets.update(created.id, { status: 'IN_PROGRESS' }, agent);
    expect(slaState(harness, created.id)?.respondedAt).not.toBeNull();
    await harness.tickets.update(
      created.id,
      { status: 'WAITING_FOR_USER' },
      agent,
    );
    expect(slaState(harness, created.id)?.pausedAt).not.toBeNull();
    await harness.collaboration.createMessage(
      created.id,
      { type: 'USER_REPLY', body: 'Here is the screenshot' },
      requester,
    );
    expect(slaState(harness, created.id)?.pausedAt).toBeNull();
  });

  it('starts paused for PENDING_APPROVAL and resumes after approve', async () => {
    const harness = createTicketsServiceHarness();
    await seedTicketsSlaTimers(harness);
    harness.approvalsConfig.enabled = true;
    harness.approvalsConfig.requiredByService = {
      [ticketsTestIds.serviceVpn]: true,
    };
    const created = await harness.tickets.create(vpnCreateInput(), requester);
    expect(created.status).toBe('PENDING_APPROVAL');
    expect(slaState(harness, created.id)?.pausedAt).not.toBeNull();
    const [approval] = await harness.approvals.list(created.id, {
      actorUserId: ticketsTestIds.adminIt,
    });
    await harness.approvals.approve(
      created.id,
      approval!.id,
      { comment: 'Approved for handling' },
      { actorUserId: ticketsTestIds.adminIt },
    );
    expect(slaState(harness, created.id)?.pausedAt).toBeNull();
  });

  it('marks first response on AGENT_REPLY and does not start when disabled', async () => {
    const harness = createTicketsServiceHarness();
    await seedTicketsSlaTimers(harness);
    const live = await harness.tickets.create(vpnCreateInput(), requester);
    expect(live.status).not.toBe('IN_PROGRESS');
    await harness.collaboration.createMessage(
      live.id,
      { type: 'AGENT_REPLY', body: 'Checking the concentrator' },
      agent,
    );
    expect(slaState(harness, live.id)?.respondedAt).not.toBeNull();
    harness.slaConfig.enabled = false;
    const skipped = await harness.tickets.create(
      vpnCreateInput({ title: 'Second VPN outage' }),
      requester,
    );
    expect(slaState(harness, skipped.id)).toBeUndefined();
  });

  it('does not mark first response on requester USER_REPLY alone', async () => {
    const harness = createTicketsServiceHarness();
    await seedTicketsSlaTimers(harness);
    const created = await harness.tickets.create(vpnCreateInput(), requester);
    expect(slaState(harness, created.id)?.respondedAt).toBeNull();
    await harness.collaboration.createMessage(
      created.id,
      { type: 'USER_REPLY', body: 'Additional details from requester' },
      requester,
    );
    expect(slaState(harness, created.id)?.respondedAt).toBeNull();
  });

  it('marks first response only once when AGENT_REPLY then IN_PROGRESS', async () => {
    const harness = createTicketsServiceHarness();
    await seedTicketsSlaTimers(harness);
    const created = await harness.tickets.create(vpnCreateInput(), requester);
    await harness.collaboration.createMessage(
      created.id,
      { type: 'AGENT_REPLY', body: 'First agent reply' },
      agent,
    );
    const afterReply = slaState(harness, created.id)?.respondedAt;
    expect(afterReply).not.toBeNull();
    await harness.tickets.update(created.id, { status: 'IN_PROGRESS' }, agent);
    expect(slaState(harness, created.id)?.respondedAt?.toISOString()).toBe(
      afterReply!.toISOString(),
    );
  });
});

function slaState(
  harness: ReturnType<typeof createTicketsServiceHarness>,
  ticketId: string,
) {
  return [...harness.memory.slaStates.values()].find(
    (row) => row.ticketId === ticketId,
  );
}
