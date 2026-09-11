import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { seedItPeerAgent } from './seed-tickets-harness-actors';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';
import { redactedContentPlaceholder } from './redaction/redaction.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('Tickets confidential ACL and break-glass', () => {
  it('hides confidential tickets from same-OU agents outside the handler group', async () => {
    const harness = createTicketsServiceHarness();
    seedItPeerAgent(harness.contexts);
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentIt,
    });
    await harness.routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    const created = await harness.tickets.create(
      vpnCreateInput({ isConfidential: true }),
      { actorUserId: ticketsTestIds.requester },
    );
    expect(created.isConfidential).toBe(true);
    const listedForHandler = await harness.tickets.list(
      {},
      { actorUserId: ticketsTestIds.agentIt },
    );
    expect(listedForHandler.map((item) => item.id)).toEqual([created.id]);
    const listedForPeer = await harness.tickets.list(
      {},
      { actorUserId: ticketsTestIds.agentItPeer },
    );
    expect(listedForPeer).toEqual([]);
    await expect(
      harness.tickets.getById(created.id, {
        actorUserId: ticketsTestIds.agentItPeer,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.collaboration.listMessages(created.id, {
        actorUserId: ticketsTestIds.agentItPeer,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    const loaded = await harness.tickets.getById(created.id, {
      actorUserId: ticketsTestIds.requester,
    });
    expect(loaded.title).toBe('VPN is down');
  });

  it('keeps SuperAdmin out until break-glass with a reason, then audits without content', async () => {
    const harness = createTicketsServiceHarness();
    harness.memory.seedGroupMember({
      groupId: ticketsTestIds.groupIt,
      userId: ticketsTestIds.agentIt,
    });
    await harness.routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    const created = await harness.tickets.create(
      vpnCreateInput({ isConfidential: true }),
      { actorUserId: ticketsTestIds.requester },
    );
    const listed = await harness.tickets.list(
      {},
      { actorUserId: ticketsTestIds.superAdmin },
    );
    expect(listed).toEqual([]);
    await expect(
      harness.tickets.getById(created.id, {
        actorUserId: ticketsTestIds.superAdmin,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'CONFIDENTIAL_ACCESS_DENIED',
        details: { breakGlassAvailable: true },
      },
    });
    await expect(
      harness.confidential.requestBreakGlass(
        created.id,
        '   ',
        { actorUserId: ticketsTestIds.superAdmin },
      ),
    ).rejects.toMatchObject({
      response: { code: 'BREAK_GLASS_REASON_REQUIRED' },
    });
    const granted = await harness.confidential.requestBreakGlass(
      created.id,
      'Legal hold review',
      { actorUserId: ticketsTestIds.superAdmin },
    );
    expect(granted.ticketId).toBe(created.id);
    const visible = await harness.tickets.getById(created.id, {
      actorUserId: ticketsTestIds.superAdmin,
    });
    expect(visible.title).toBe('VPN is down');
    const serialized = JSON.stringify(harness.memory.changeLogs);
    expect(serialized).toContain('ticket_confidential_break_glass');
    expect(serialized).toContain('Legal hold review');
    expect(serialized).toContain(redactedContentPlaceholder);
    expect(serialized).not.toContain('VPN is down');
    expect(serialized).not.toContain('Cannot connect from the office');
  });

  it('allows configured viewer roles in OU/service scope without break-glass', async () => {
    const harness = createTicketsServiceHarness();
    harness.confidentialConfig.allowedViewerRoles = [
      authorizationRoleKeys.admin,
    ];
    await harness.routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    const created = await harness.tickets.create(
      vpnCreateInput({ isConfidential: true }),
      { actorUserId: ticketsTestIds.requester },
    );
    const listed = await harness.tickets.list(
      {},
      { actorUserId: ticketsTestIds.adminIt },
    );
    expect(listed.map((item) => item.id)).toEqual([created.id]);
  });

  it('allows an explicit grant and keeps ordinary tickets visible to SuperAdmin', async () => {
    const harness = createTicketsServiceHarness();
    seedItPeerAgent(harness.contexts);
    await harness.routing.createRule({
      originUnitId: ticketsTestIds.ouIt,
      serviceId: ticketsTestIds.serviceVpn,
      groupId: ticketsTestIds.groupIt,
      reason: 'IT VPN coverage',
    });
    const confidential = await harness.tickets.create(
      vpnCreateInput({ isConfidential: true }),
      { actorUserId: ticketsTestIds.requester },
    );
    await harness.memory.prisma.ticketConfidentialGrant.create({
      data: {
        ticketId: confidential.id,
        userId: ticketsTestIds.agentItPeer,
        groupId: null,
        grantedByUserId: ticketsTestIds.agentIt,
      },
    });
    const granted = await harness.tickets.list(
      {},
      { actorUserId: ticketsTestIds.agentItPeer },
    );
    expect(granted.map((item) => item.id)).toEqual([confidential.id]);
    const ordinary = await harness.tickets.create(vpnCreateInput(), {
      actorUserId: ticketsTestIds.requester,
    });
    const listedForSuperAdmin = await harness.tickets.list(
      {},
      { actorUserId: ticketsTestIds.superAdmin },
    );
    expect(listedForSuperAdmin.map((item) => item.id)).toEqual([ordinary.id]);
  });
});
