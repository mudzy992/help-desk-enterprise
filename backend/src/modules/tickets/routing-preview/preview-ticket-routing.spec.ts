import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../create-tickets-service-harness';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { ouIt, ouHr, ouRoot, serviceVpn, serviceAccess, groupIt, requester, agentHr } =
  ticketsTestIds;

describe('POST /tickets/routing-preview', () => {
  it('previews an exact match: group name, no fallback, no approval, effective auto-assign', async () => {
    const { tickets, routing } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ouIt,
      serviceId: serviceVpn,
      groupId: groupIt,
      reason: 'IT VPN coverage',
    });
    const preview = await tickets.previewRouting(
      { originUnitId: ouIt, serviceId: serviceVpn },
      { actorUserId: requester },
    );
    expect(preview).toEqual({
      outcome: 'EXACT',
      groupName: 'IT Support',
      fallbackDepth: 0,
      autoAssign: 'NONE',
      approvalSteps: 0,
      slaProfileName: null,
    });
  });

  it('previews a parent-fallback match and reports the fallback depth', async () => {
    const { tickets, routing } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ouRoot,
      serviceId: serviceVpn,
      groupId: groupIt,
      reason: 'Root VPN coverage',
    });
    const preview = await tickets.previewRouting(
      { originUnitId: ouIt, serviceId: serviceVpn },
      { actorUserId: requester },
    );
    expect(preview.outcome).toBe('PARENT_FALLBACK');
    expect(preview.fallbackDepth).toBe(1);
    expect(preview.groupName).toBe('IT Support');
  });

  it('previews an unrouted outcome with no group and no auto-assign, even with global auto-assign on', async () => {
    const { tickets, assignmentConfig } = createTicketsServiceHarness();
    assignmentConfig.autoAssignEnabled = true;
    assignmentConfig.autoAssignStrategy = 'ROUND_ROBIN';
    const preview = await tickets.previewRouting(
      { originUnitId: ouIt, serviceId: serviceVpn },
      { actorUserId: requester },
    );
    expect(preview.outcome).toBe('UNROUTED');
    expect(preview.groupName).toBeNull();
    // There is no group to auto-assign into, so this never reports the
    // otherwise-active global strategy for an unrouted ticket.
    expect(preview.autoAssign).toBe('NONE');
  });

  it('reports the effective auto-assign strategy for a routed group', async () => {
    const { tickets, routing, assignmentConfig } = createTicketsServiceHarness();
    assignmentConfig.autoAssignEnabled = true;
    assignmentConfig.autoAssignStrategy = 'ROUND_ROBIN';
    await routing.createRule({
      originUnitId: ouIt,
      serviceId: serviceVpn,
      groupId: groupIt,
      reason: 'IT VPN coverage',
    });
    const preview = await tickets.previewRouting(
      { originUnitId: ouIt, serviceId: serviceVpn },
      { actorUserId: requester },
    );
    expect(preview.autoAssign).toBe('ROUND_ROBIN');
  });

  it('reports one approval step for a service that requires approval', async () => {
    const { tickets, routing } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ouIt,
      serviceId: serviceAccess,
      groupId: groupIt,
      reason: 'IT access coverage',
    });
    const preview = await tickets.previewRouting(
      { originUnitId: ouIt, serviceId: serviceAccess },
      { actorUserId: requester },
    );
    expect(preview.approvalSteps).toBe(1);
  });

  it('defaults originUnitId to the requester\'s home unit, like create does', async () => {
    const { tickets, routing } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ouIt,
      serviceId: serviceVpn,
      groupId: groupIt,
      reason: 'IT VPN coverage',
    });
    const preview = await tickets.previewRouting(
      { serviceId: serviceVpn },
      { actorUserId: requester },
    );
    expect(preview.outcome).toBe('EXACT');
  });

  it('never reveals a group for an OU/service the caller could not submit a ticket to', async () => {
    const { tickets, routing } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ouHr,
      serviceId: serviceVpn,
      groupId: groupIt,
      reason: 'HR VPN coverage',
    });
    const rejection: unknown = await tickets
      .previewRouting({ originUnitId: ouHr, serviceId: serviceVpn }, { actorUserId: requester })
      .catch((error: unknown) => error);
    expect(rejection).toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(JSON.stringify(rejection)).not.toContain('IT Support');
  });

  it('lets an in-scope agent preview a service outside their own OU', async () => {
    const { tickets, routing } = createTicketsServiceHarness();
    await routing.createRule({
      originUnitId: ouHr,
      serviceId: serviceVpn,
      groupId: groupIt,
      reason: 'HR VPN coverage',
    });
    const preview = await tickets.previewRouting(
      { originUnitId: ouHr, serviceId: serviceVpn },
      { actorUserId: agentHr },
    );
    expect(preview.outcome).toBe('EXACT');
  });

  it('rejects an unknown service', async () => {
    const { tickets } = createTicketsServiceHarness();
    await expect(
      tickets.previewRouting(
        { originUnitId: ouIt, serviceId: 'service-does-not-exist' },
        { actorUserId: requester },
      ),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_NOT_FOUND' } });
  });
});
