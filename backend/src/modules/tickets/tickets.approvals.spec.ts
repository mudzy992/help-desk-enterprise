import { accessCreateInput } from './access-create-input';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ticket approvals', () => {
  it('holds routed tickets for services that require approval', async () => {
    const harness = await prepareRoutedAccess();
    const created = await harness.tickets.create(accessCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(created.status).toBe('PENDING_APPROVAL');
    expect(created.assignedGroupId).toBe(ticketsTestIds.groupIt);
    expect(created.assignedUserId).toBeNull();
    const listed = await harness.approvals.list(created.id, {
      actorUserId: ticketsTestIds.adminIt,
    });
    expect(listed).toHaveLength(1);
    const [pending] = listed;
    expect(pending?.status).toBe('PENDING');
    expect(pending?.canDecide).toBe(true);
    await expect(
      harness.tickets.claim(created.id, {
        actorUserId: ticketsTestIds.agentIt,
      }),
    ).rejects.toMatchObject({ response: { code: 'TICKET_NOT_CLAIMABLE' } });
  });

  it('leaves ordinary services in PENDING and respects disable/overlay settings', async () => {
    const harness = await prepareRoutedAccess();
    const vpn = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(vpn.status).toBe('PENDING');
    harness.approvalsConfig.requiredByService[ticketsTestIds.serviceVpn] = true;
    const overlaid = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(overlaid.status).toBe('PENDING_APPROVAL');
    harness.approvalsConfig.requiredByService[ticketsTestIds.serviceAccess] =
      false;
    const skipped = await harness.tickets.create(accessCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(skipped.status).toBe('PENDING');
    harness.approvalsConfig.enabled = false;
    const disabled = await harness.tickets.create(accessCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    expect(disabled.status).toBe('PENDING');
  });

  it('approves into PENDING then auto-assign, and rejects into CLOSED', async () => {
    const harness = await prepareRoutedAccess();
    harness.assignmentConfig.autoAssignEnabled = true;
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentIt,
    });
    const approvedTicket = await harness.tickets.create(accessCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const [pending] = await harness.approvals.list(approvedTicket.id, {
      actorUserId: ticketsTestIds.adminIt,
    });
    expect(pending).toBeDefined();
    const approved = await harness.approvals.approve(
      approvedTicket.id,
      pending!.id,
      { comment: 'Access is justified' },
      { actorUserId: ticketsTestIds.adminIt },
    );
    expect(approved.status).toBe('ASSIGNED');
    expect(approved.assignedUserId).toBe(ticketsTestIds.agentIt);
    const rejectedTicket = await harness.tickets.create(accessCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const [rejectPending] = await harness.approvals.list(rejectedTicket.id, {
      actorUserId: ticketsTestIds.superAdmin,
    });
    expect(rejectPending).toBeDefined();
    const rejected = await harness.approvals.reject(
      rejectedTicket.id,
      rejectPending!.id,
      { comment: 'Not authorized' },
      { actorUserId: ticketsTestIds.superAdmin },
    );
    expect(rejected.status).toBe('CLOSED');
  });

  it('blocks requester, agent, patch shortcuts, and empty comments', async () => {
    const harness = await prepareRoutedAccess();
    const created = await harness.tickets.create(accessCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const [pending] = await harness.approvals.list(created.id, {
      actorUserId: ticketsTestIds.adminIt,
    });
    expect(pending).toBeDefined();
    await expect(
      harness.approvals.approve(created.id, pending!.id, { comment: 'self' }, {
        actorUserId: ticketsTestIds.requester,
      }),
    ).rejects.toMatchObject({ response: { code: 'APPROVAL_SELF_FORBIDDEN' } });
    await expect(
      harness.approvals.approve(created.id, pending!.id, { comment: 'agent' }, {
        actorUserId: ticketsTestIds.agentIt,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.tickets.update(
        created.id,
        { status: 'PENDING' },
        { actorUserId: ticketsTestIds.adminIt },
      ),
    ).rejects.toMatchObject({
      response: { code: 'APPROVAL_DECISION_REQUIRED' },
    });
    await expect(
      harness.approvals.reject(
        created.id,
        pending!.id,
        { comment: '   ' },
        { actorUserId: ticketsTestIds.adminIt },
      ),
    ).rejects.toMatchObject({
      response: { code: 'APPROVAL_COMMENT_REQUIRED' },
    });
  });
});

async function prepareRoutedAccess() {
  const harness = createTicketsServiceHarness();
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceAccess,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT access coverage',
  });
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  return harness;
}
