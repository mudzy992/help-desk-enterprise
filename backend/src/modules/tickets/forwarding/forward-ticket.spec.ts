import {
  authorizationRoleKeys,
  permissionKeys,
} from '../../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../../authorization/create-test-authorization-context';
import { resolveNotificationAudience } from '../../notifications/fan-out/resolve-notification-recipients';
import { notificationTypes } from '../../notifications/notifications.constants';
import { resetScopeCatalogCache } from '../../../common/cache/scope-catalog-cache';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../create-tickets-service-harness';
import type { TicketRecord } from '../tickets.types';
import { vpnCreateInput } from '../vpn-create-input';
import { defaultTicketForwardingConfiguration } from './forwarding.constants';
import type {
  ForwardTicketInput,
  TicketForwardingConfiguration,
} from './forwarding.types';
import { forwardTicket } from './forward-ticket';
import { listForwardHistory } from './list-forward-history';
import { listForwardTargets } from './list-forward-targets';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Package 1.1 — the owner's scenario: a ticket from OU "IT" (think Zenica),
 * handled by "IT Support" (IT), is forwarded to "Telefonija HR" in the sibling
 * OU "HR" (think Direkcija), whose agents otherwise have no scope over IT.
 */
const groupHr = 'group-hr-telefonija';
const groupIt2 = 'group-it-network';
const reason = 'Potrebne su ovlasti Direkcije za ovu liniju';

function staffContext(
  subjectId: string,
  unitId: string,
  unitPath: string,
  options: { crossOu?: boolean; role?: string } = {},
) {
  return createTestAuthorizationContext({
    subjectId,
    assignments: [
      createTestAssignment({
        roleKey: options.role ?? authorizationRoleKeys.agent,
        organizationalUnitId: unitId,
        organizationalUnitPath: unitPath,
        permissionKeys: [
          permissionKeys.ticketBulkAssign,
          ...(options.crossOu === false ? [] : [permissionKeys.ticketForwardCrossOu]),
        ],
      }),
    ],
  });
}

async function setup() {
  resetScopeCatalogCache();
  const harness = createTicketsServiceHarness();
  const { memory, contexts } = harness;
  memory.seedGroup({ id: groupHr, name: 'Telefonija HR', organizationalUnitId: ticketsTestIds.ouHr });
  memory.seedGroup({ id: groupIt2, name: 'IT Mreža', organizationalUnitId: ticketsTestIds.ouIt });
  memory.seedGroupMember({ groupId: ticketsTestIds.groupIt, userId: ticketsTestIds.agentIt });
  memory.seedGroupMember({ groupId: groupHr, userId: ticketsTestIds.agentHr });
  memory.seedUser({ id: ticketsTestIds.agentItPeer, organizationalUnitId: ticketsTestIds.ouIt });
  contexts.set(
    ticketsTestIds.agentIt,
    staffContext(ticketsTestIds.agentIt, ticketsTestIds.ouIt, '/Korisnici/IT'),
  );
  contexts.set(
    ticketsTestIds.agentHr,
    staffContext(ticketsTestIds.agentHr, ticketsTestIds.ouHr, '/Korisnici/HR'),
  );
  contexts.set(
    ticketsTestIds.agentItPeer,
    staffContext(ticketsTestIds.agentItPeer, ticketsTestIds.ouIt, '/Korisnici/IT'),
  );
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const ticket = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  const configuration: { -readonly [K in keyof TicketForwardingConfiguration]: TicketForwardingConfiguration[K] } = {
    ...defaultTicketForwardingConfiguration,
  };
  const messages: TicketPersistedMessageSink = [];
  const forward = (
    actorUserId: string,
    body: ForwardTicketInput,
    ticketId: string = ticket.id,
  ) =>
    forwardTicket({
      prisma: memory.prisma as never,
      authorizationContextLoader: harness.authorizationContextLoader as never,
      configuration,
      ticketId,
      body,
      context: { actorUserId },
      messages,
    });
  const reload = () => memory.tickets.get(ticket.id) as TicketRecord;
  return { harness, memory, contexts, ticket, configuration, messages, forward, reload };
}

describe('forwardTicket (package 1.1)', () => {
  it('forwards cross-OU with a reason and records participants, history, audit and a system event', async () => {
    const { memory, ticket, forward, messages } = await setup();
    expect(ticket.assignedGroupId).toBe(ticketsTestIds.groupIt);
    const forwarded = await forward(ticketsTestIds.agentIt, {
      targetGroupId: groupHr,
      reason: `  ${reason}  `,
    });
    expect(forwarded.assignedGroupId).toBe(groupHr);
    expect(forwarded.assignedUserId).toBeNull();
    expect(forwarded.status).toBe('PENDING');
    const roles = [...memory.participants.values()]
      .filter((row) => row.ticketId === ticket.id)
      .map((row) => `${row.role}:${row.groupId ?? row.userId}`);
    expect(roles).toEqual(
      expect.arrayContaining([
        `FORWARDED_FROM_GROUP:${ticketsTestIds.groupIt}`,
        `FORWARDED_TO_GROUP:${groupHr}`,
        `HANDLER_GROUP:${groupHr}`,
      ]),
    );
    expect(roles).not.toContain(`HANDLER_GROUP:${ticketsTestIds.groupIt}`);
    const [event] = [...memory.forwardEvents.values()];
    expect(event).toMatchObject({
      ticketId: ticket.id,
      fromGroupId: ticketsTestIds.groupIt,
      toGroupId: groupHr,
      fromUnitId: ticketsTestIds.ouIt,
      toUnitId: ticketsTestIds.ouHr,
      isCrossOu: true,
      reason,
      requesterNotified: true,
      viaBulk: false,
    });
    expect(messages.map((message) => message.body)).toContain(`ticket_forwarded:${event?.id}`);
    expect(memory.changeLogs.some((entry) => entry.reason === 'ticket_forward')).toBe(true);
    const audit = memory.auditLogs.find((entry) => entry.action === 'ticket.forwarded');
    expect(audit).toMatchObject({
      entityId: ticket.id,
      actorUserId: ticketsTestIds.agentIt,
      organizationalUnitId: ticketsTestIds.ouIt,
    });
    expect(audit?.metadata).toMatchObject({ isCrossOu: true, toGroupId: groupHr, reason });
  });

  it('D1: the target group handles the ticket; the old group still sees it by OU but not in its inbox', async () => {
    const { harness, ticket, forward } = await setup();
    const hr = { actorUserId: ticketsTestIds.agentHr };
    const it = { actorUserId: ticketsTestIds.agentIt };
    await expect(harness.tickets.getById(ticket.id, hr)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    await forward(ticketsTestIds.agentIt, { targetGroupId: groupHr, reason });
    resetScopeCatalogCache();
    await expect(harness.tickets.getById(ticket.id, hr)).resolves.toMatchObject({ id: ticket.id });
    const hrInbox = await harness.tickets.listInbox({}, hr);
    expect(hrInbox.items.map((item) => item.id)).toContain(ticket.id);
    const claimed = await harness.tickets.claim(ticket.id, hr);
    expect(claimed.assignedUserId).toBe(ticketsTestIds.agentHr);
    await expect(harness.tickets.getById(ticket.id, it)).resolves.toMatchObject({ id: ticket.id });
    const itInbox = await harness.tickets.listInbox({}, it);
    expect(itInbox.items.map((item) => item.id)).not.toContain(ticket.id);
  });

  it('lets the new group hand the ticket back and then drops its access', async () => {
    const { harness, ticket, forward, reload } = await setup();
    await forward(ticketsTestIds.agentIt, { targetGroupId: groupHr, reason });
    resetScopeCatalogCache();
    // HR's cross-OU permission covers the OU of the group now handling it.
    await forward(ticketsTestIds.agentHr, {
      targetGroupId: ticketsTestIds.groupIt,
      reason: 'Riješeno na strani Direkcije, vraćam',
    });
    expect(reload().assignedGroupId).toBe(ticketsTestIds.groupIt);
    resetScopeCatalogCache();
    await expect(
      harness.tickets.getById(ticket.id, { actorUserId: ticketsTestIds.agentHr }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('requires ticket.forward.cross_ou and the allowCrossOu setting for another OU, not within the OU', async () => {
    const { contexts, configuration, forward } = await setup();
    contexts.set(
      ticketsTestIds.agentIt,
      staffContext(ticketsTestIds.agentIt, ticketsTestIds.ouIt, '/Korisnici/IT', {
        crossOu: false,
      }),
    );
    await expect(
      forward(ticketsTestIds.agentIt, { targetGroupId: groupHr, reason }),
    ).rejects.toMatchObject({ code: 'FORWARD_CROSS_OU_FORBIDDEN' });
    const sameOu = await forward(ticketsTestIds.agentIt, {
      targetGroupId: groupIt2,
      reason,
    });
    expect(sameOu.assignedGroupId).toBe(groupIt2);
    configuration.allowCrossOu = false;
    await expect(
      forward(ticketsTestIds.superAdmin, { targetGroupId: groupHr, reason }),
    ).rejects.toMatchObject({ code: 'FORWARD_CROSS_OU_DISABLED' });
  });

  it('validates reason, target group, status and the target agent', async () => {
    const { memory, ticket, forward, reload } = await setup();
    await expect(
      forward(ticketsTestIds.agentIt, { targetGroupId: groupHr, reason: 'kratko' }),
    ).rejects.toMatchObject({ code: 'FORWARD_REASON_REQUIRED' });
    await expect(
      forward(ticketsTestIds.agentIt, { targetGroupId: ticketsTestIds.groupIt, reason }),
    ).rejects.toMatchObject({ code: 'FORWARD_SAME_GROUP' });
    await expect(
      forward(ticketsTestIds.agentIt, { targetGroupId: 'group-missing', reason }),
    ).rejects.toMatchObject({ code: 'HANDLER_GROUP_NOT_FOUND' });
    await expect(
      forward(ticketsTestIds.agentIt, {
        targetGroupId: groupHr,
        targetUserId: ticketsTestIds.agentItPeer,
        reason,
      }),
    ).rejects.toMatchObject({ code: 'FORWARD_TARGET_USER_NOT_MEMBER' });
    const direct = await forward(ticketsTestIds.agentIt, {
      targetGroupId: groupHr,
      targetUserId: ticketsTestIds.agentHr,
      reason,
    });
    expect(direct.assignedUserId).toBe(ticketsTestIds.agentHr);
    expect(direct.status).toBe('ASSIGNED');
    memory.tickets.set(ticket.id, { ...reload(), status: 'RESOLVED' });
    await expect(
      forward(ticketsTestIds.superAdmin, { targetGroupId: groupIt2, reason }),
    ).rejects.toMatchObject({ code: 'FORWARD_NOT_ALLOWED_IN_STATUS' });
  });

  it('keeps a ticket waiting for the user waiting, and lets only members of the current group forward', async () => {
    const { memory, ticket, forward, reload } = await setup();
    await expect(
      forward(ticketsTestIds.agentItPeer, { targetGroupId: groupIt2, reason }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    memory.tickets.set(ticket.id, { ...reload(), status: 'WAITING_FOR_USER' });
    const moved = await forward(ticketsTestIds.agentIt, { targetGroupId: groupIt2, reason });
    expect(moved.status).toBe('WAITING_FOR_USER');
  });

  it('removes the previous assignee (no lingering confidential access) unless kept as watcher', async () => {
    const { harness, memory, ticket, configuration, forward } = await setup();
    await harness.tickets.claim(ticket.id, { actorUserId: ticketsTestIds.agentIt });
    await forward(ticketsTestIds.agentIt, { targetGroupId: groupIt2, reason });
    const rows = () =>
      [...memory.participants.values()].filter(
        (row) => row.ticketId === ticket.id && row.userId === ticketsTestIds.agentIt,
      );
    expect(rows().map((row) => row.role)).toEqual([]);
    configuration.keepPreviousHandlersAsWatchers = true;
    memory.seedGroupMember({ groupId: groupIt2, userId: ticketsTestIds.agentIt });
    resetScopeCatalogCache();
    await harness.tickets.claim(ticket.id, { actorUserId: ticketsTestIds.agentIt });
    await forward(ticketsTestIds.agentIt, { targetGroupId: groupHr, reason });
    expect(rows().map((row) => row.role)).toEqual(['WATCHER']);
  });

  it('notifies the target group once, plus the previous assignee and the requester', async () => {
    const { harness, memory, ticket, forward, reload } = await setup();
    await harness.tickets.claim(ticket.id, { actorUserId: ticketsTestIds.agentIt });
    await forward(ticketsTestIds.superAdmin, { targetGroupId: groupHr, reason });
    const [event] = [...memory.forwardEvents.values()];
    const audience = await resolveNotificationAudience(memory.prisma as never, {
      type: notificationTypes.ticketForwarded,
      ticket: reload(),
      actorUserId: ticketsTestIds.superAdmin,
      event: 'ticket_forwarded',
      messageBody: `ticket_forwarded:${event?.id}`,
    });
    expect(audience.group?.groupId).toBe(groupHr);
    expect([...audience.userIds].sort()).toEqual(
      [ticketsTestIds.agentIt, ticketsTestIds.requester].sort(),
    );
  });

  it('lists allowed targets (cross-OU hidden without permission) and the forward history', async () => {
    const { harness, memory, contexts, ticket, configuration, forward } = await setup();
    const targets = (actorUserId: string) =>
      listForwardTargets({
        prisma: memory.prisma as never,
        authorizationContextLoader: harness.authorizationContextLoader as never,
        configuration,
        ticketId: ticket.id,
        context: { actorUserId },
      });
    const full = await targets(ticketsTestIds.agentIt);
    expect(full.crossOuAllowed).toBe(true);
    expect(full.groups.map((group) => [group.id, group.isCrossOu])).toEqual([
      [groupIt2, false],
      [groupHr, true],
    ]);
    contexts.set(
      ticketsTestIds.agentIt,
      staffContext(ticketsTestIds.agentIt, ticketsTestIds.ouIt, '/Korisnici/IT', {
        crossOu: false,
      }),
    );
    const narrow = await targets(ticketsTestIds.agentIt);
    expect(narrow.groups.map((group) => group.id)).toEqual([groupIt2]);
    await forward(ticketsTestIds.agentIt, { targetGroupId: groupIt2, reason });
    const history = await listForwardHistory({
      prisma: memory.prisma as never,
      authorizationContextLoader: harness.authorizationContextLoader as never,
      ticketId: ticket.id,
      context: { actorUserId: ticketsTestIds.agentIt },
    });
    expect(history).toEqual([
      expect.objectContaining({
        fromGroupName: 'IT Support',
        toGroupName: 'IT Mreža',
        isCrossOu: false,
        reason,
      }),
    ]);
    await expect(
      listForwardHistory({
        prisma: memory.prisma as never,
        authorizationContextLoader: harness.authorizationContextLoader as never,
        ticketId: ticket.id,
        context: { actorUserId: ticketsTestIds.requester },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const back = await targets(ticketsTestIds.agentIt);
    expect(back.previousGroupId).toBe(ticketsTestIds.groupIt);
  });

  it('bulk assign_group follows the same rules (reason, cross-OU permission)', async () => {
    const { harness, memory, ticket, contexts } = await setup();
    const agent = { actorUserId: ticketsTestIds.agentIt };
    await expect(
      harness.bulk.execute(
        { ticketIds: [ticket.id], actionType: 'assign_group', assignedGroupId: groupHr },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORWARD_REASON_REQUIRED' } });
    contexts.set(
      ticketsTestIds.agentIt,
      staffContext(ticketsTestIds.agentIt, ticketsTestIds.ouIt, '/Korisnici/IT', {
        crossOu: false,
      }),
    );
    await expect(
      harness.bulk.execute(
        { ticketIds: [ticket.id], actionType: 'assign_group', assignedGroupId: groupHr, reason },
        agent,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORWARD_CROSS_OU_FORBIDDEN' } });
    const result = await harness.bulk.execute(
      { ticketIds: [ticket.id], actionType: 'assign_group', assignedGroupId: groupIt2, reason },
      agent,
    );
    expect(result.tickets[0]?.assignedGroupId).toBe(groupIt2);
    expect([...memory.forwardEvents.values()][0]).toMatchObject({ viaBulk: true, reason });
  });
});
