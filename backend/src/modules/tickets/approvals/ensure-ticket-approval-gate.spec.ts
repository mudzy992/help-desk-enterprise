import { accessCreateInput } from '../access-create-input';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../create-tickets-service-harness';
import { defaultTicketForwardingConfiguration } from '../forwarding/forwarding.constants';
import { forwardTicket } from '../forwarding/forward-ticket';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import type { TicketRecord } from '../tickets.types';
import type { TicketApprovalsConfiguration } from './approvals.types';
import { ensureTicketApprovalGate } from './ensure-ticket-approval-gate';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Val 2 (M9/B2). Without a routing rule for (origin OU + service) the ticket is
 * created as `UNROUTED` and `resolveCreateTicketApprovalStatus` skips the gate,
 * so a service that requires approval could be worked on with no approval at
 * all once an admin added a rule and an agent forwarded the ticket.
 */
describe('approval gate on entering processing (val 2, M9/B2)', () => {
  const approvals = {
    enabled: true,
    requiredByService: {},
    defaultApproverRole: 'ADMIN',
    allowRequesterManager: false,
  } as const satisfies TicketApprovalsConfiguration;

  async function setupUnrouted() {
    // Deliberately no routing rule for (ouIt, serviceAccess): the ticket stays UNROUTED.
    const harness = createTicketsServiceHarness();
    await harness.routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    const ticket = await harness.tickets.create(accessCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    return { harness, ticket };
  }

  it('tiketa koji je počeo kao UNROUTED ne prolazi bez odobrenja', async () => {
    const { harness, ticket } = await setupUnrouted();
    expect(ticket.status).toBe('UNROUTED');
    expect(ticket.assignedGroupId).toBeNull();

    const messages: TicketPersistedMessageSink = [];
    const forwarded = await forwardTicket({
      prisma: harness.memory.prisma as never,
      authorizationContextLoader: harness.authorizationContextLoader as never,
      configuration: { ...defaultTicketForwardingConfiguration },
      ticketId: ticket.id,
      body: { targetGroupId: ticketsTestIds.groupIt, reason: 'Rutiranje na IT grupu' },
      context: { actorUserId: ticketsTestIds.adminIt },
      messages,
      approvals,
    });

    expect(forwarded.status).toBe('PENDING_APPROVAL');
    expect(forwarded.assignedGroupId).toBe(ticketsTestIds.groupIt);
    const approvalsRows = await harness.memory.prisma.ticketApproval.findMany({
      where: { ticketId: ticket.id },
    });
    expect(approvalsRows).toHaveLength(1);
    expect(approvalsRows[0]).toMatchObject({
      ticketId: ticket.id,
      status: 'PENDING',
      stepOrder: 1,
    });
    expect(messages.map((message) => message.body)).toContain(
      'ticket_approval_requested',
    );
  });

  it('kapija se ne otvara drugi put kad odobrenje već postoji', async () => {
    const { harness, ticket } = await setupUnrouted();
    const gate = () =>
      ensureTicketApprovalGate({
        prisma: harness.memory.prisma as never,
        ticket: harness.memory.tickets.get(ticket.id) as TicketRecord,
        configuration: approvals,
        serviceRequiresApproval: true,
        actorUserId: ticketsTestIds.adminIt,
        messages: [],
      });

    // Prvi poziv pomjera tiket i otvara kapiju; drugi je bez efekta.
    const first = await gate();
    expect(first.gated).toBe(true);
    const second = await gate();
    expect(second.gated).toBe(false);
    expect(second.ticket.status).toBe('PENDING_APPROVAL');
    expect(
      await harness.memory.prisma.ticketApproval.findMany({
        where: { ticketId: ticket.id },
      }),
    ).toHaveLength(1);
    expect(harness.memory.messages.size).toBeGreaterThan(0);
  });

  it('servis bez odobrenja ostaje u PENDING i bez zapisa odobrenja', async () => {
    const { harness, ticket } = await setupUnrouted();
    const messages: TicketPersistedMessageSink = [];
    const forwarded = await forwardTicket({
      prisma: harness.memory.prisma as never,
      authorizationContextLoader: harness.authorizationContextLoader as never,
      configuration: { ...defaultTicketForwardingConfiguration },
      ticketId: ticket.id,
      body: { targetGroupId: ticketsTestIds.groupIt, reason: 'Rutiranje na IT grupu' },
      context: { actorUserId: ticketsTestIds.adminIt },
      messages,
      approvals: {
        ...approvals,
        requiredByService: { [ticketsTestIds.serviceAccess]: false },
      },
    });

    expect(forwarded.status).toBe('PENDING');
    expect(
      await harness.memory.prisma.ticketApproval.findMany({
        where: { ticketId: ticket.id },
      }),
    ).toHaveLength(0);
  });
});
