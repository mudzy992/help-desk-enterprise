import type { TicketPersistedMessageSink } from './collaboration.types';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { copyMessageToMergedTickets } from './merge/copy-message-to-merged-tickets';
import { assertMergeAllowed } from './merge/assert-merge-allowed';
import { mergeTicket } from './merge/merge-ticket';
import { unmergeTicket } from './merge/unmerge-ticket';
import { overrideTicketPriority } from './priority/override-ticket-priority';
import type { TicketRecord } from './tickets.types';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type Harness = ReturnType<typeof createTicketsServiceHarness>;

describe('package 1.2 — manual priority and merge', () => {
  const agent = { actorUserId: ticketsTestIds.agentIt };

  describe('priority override', () => {
    it('sets the priority by hand, keeps it on later edits and can hand it back to the matrix', async () => {
      const harness = createTicketsServiceHarness();
      const [ticket] = await createPair(harness);
      const overridden = await override(harness, ticket.id, {
        priority: ticket.priority === 'CRITICAL' ? 'LOW' : 'CRITICAL',
        reason: 'VIP korisnik',
      });
      expect(overridden.priorityOverridden).toBe(true);
      expect(overridden.priorityOverriddenById).toBe(ticketsTestIds.agentIt);
      const patched = await harness.tickets.update(ticket.id, { status: 'IN_PROGRESS' }, agent);
      expect(patched.priority).toBe(overridden.priority);
      const changedImpact = await harness.tickets.update(
        ticket.id,
        { impact: ticket.impact === 'LOW' ? 'HIGH' : 'LOW' },
        agent,
      );
      expect(changedImpact.priority).toBe(overridden.priority);
      const reset = await override(harness, ticket.id, {
        resetToMatrix: true,
        reason: 'Vraćeno na matricu',
      });
      expect(reset.priorityOverridden).toBe(false);
      const events = await systemEvents(harness, ticket.id);
      expect(events.some((body) => body.startsWith('ticket_priority_overridden:'))).toBe(true);
    });

    it('rejects the same priority, a short reason, a requester and a merged ticket', async () => {
      const harness = createTicketsServiceHarness();
      const [ticket, other] = await createPair(harness);
      await expect(
        override(harness, ticket.id, { priority: ticket.priority, reason: 'isti' }),
      ).rejects.toMatchObject({ code: 'PRIORITY_UNCHANGED' });
      await expect(
        override(harness, ticket.id, { priority: 'CRITICAL', reason: 'x' }),
      ).rejects.toMatchObject({ code: 'PRIORITY_REASON_REQUIRED' });
      await expect(
        override(harness, ticket.id, { priority: 'CRITICAL', reason: 'hitno' }, ticketsTestIds.requester),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        override(harness, ticket.id, { resetToMatrix: true, reason: 'nazad' }),
      ).rejects.toMatchObject({ code: 'PRIORITY_NOT_OVERRIDDEN' });
      await merge(harness, other.id, ticket.id);
      await expect(
        override(harness, other.id, { priority: 'CRITICAL', reason: 'hitno' }),
      ).rejects.toMatchObject({ code: 'TICKET_MERGED' });
    });
  });

  describe('merge', () => {
    it('merges a child, informs its requester and blocks edits on the child', async () => {
      const harness = createTicketsServiceHarness();
      const [parent, child] = await createPair(harness);
      const messages: TicketPersistedMessageSink = [];
      const { child: merged } = await merge(harness, child.id, parent.id, messages);
      expect(merged.mergedIntoTicketId).toBe(parent.id);
      expect(merged.mergedById).toBe(ticketsTestIds.agentIt);
      expect(merged.status).toBe(parent.status);
      expect(messages.some((m) => m.ticketId === child.id && m.type === 'AGENT_REPLY')).toBe(true);
      expect(messages.some((m) => m.ticketId === parent.id && m.body.startsWith('ticket_merged:'))).toBe(
        true,
      );
      await expect(
        harness.tickets.update(child.id, { status: 'IN_PROGRESS' }, agent),
      ).rejects.toMatchObject({ response: { code: 'TICKET_MERGED' } });
      await expect(
        harness.collaboration.createMessage(child.id, { type: 'AGENT_REPLY', body: 'x' }, agent),
      ).rejects.toMatchObject({ response: { code: 'TICKET_MERGED' } });
    });

    it('enforces rule M1: no self merge, no chains, no confidential mix', async () => {
      const harness = createTicketsServiceHarness();
      const [a, b] = await createPair(harness);
      const [c] = await createPair(harness);
      await expect(merge(harness, a.id, a.id)).rejects.toMatchObject({ code: 'MERGE_SELF' });
      await merge(harness, b.id, a.id);
      await expect(merge(harness, c.id, b.id)).rejects.toMatchObject({
        code: 'MERGE_PARENT_INVALID',
      });
      await expect(merge(harness, a.id, c.id)).rejects.toMatchObject({
        code: 'MERGE_CHILD_INVALID',
      });
      // Staff without confidential access never reach the rule (FORBIDDEN);
      // the rule itself is checked on the shared validator.
      const confidential = { ...(await load(harness, c.id)), isConfidential: true };
      await expect(
        assertMergeAllowed(harness.memory.prisma as never, confidential, [await load(harness, a.id)]),
      ).rejects.toMatchObject({ code: 'MERGE_CONFIDENTIAL_MISMATCH' });
      await expect(merge(harness, c.id, a.id, [], 'x')).rejects.toMatchObject({
        code: 'MERGE_REASON_REQUIRED',
      });
    });

    it('children follow the parent into RESOLVED and back on reopen, with the resolution', async () => {
      const harness = createTicketsServiceHarness();
      const [parent, child] = await createPair(harness);
      await merge(harness, child.id, parent.id);
      await harness.tickets.update(parent.id, { status: 'IN_PROGRESS' }, agent);
      expect((await load(harness, child.id)).status).not.toBe('IN_PROGRESS');
      await harness.tickets.update(
        parent.id,
        { status: 'RESOLVED', closeCode: 'bug_fixed', resolutionNote: 'VPN certifikat obnovljen' },
        agent,
      );
      const resolved = await load(harness, child.id);
      expect(resolved.status).toBe('RESOLVED');
      expect(resolved.resolutionNote).toBe('VPN certifikat obnovljen');
      expect(resolved.resolvedAt).not.toBeNull();
      expect((await systemEvents(harness, child.id)).some((b) => b === 'ticket_resolved')).toBe(true);
      await harness.reopen.reopen(parent.id, {}, { actorUserId: ticketsTestIds.requester });
      const reopened = await load(harness, child.id);
      expect(reopened.status).toBe('IN_PROGRESS');
      expect(reopened.mergedIntoTicketId).toBe(parent.id);
    });

    it('copies a public reply to children, never an internal note', async () => {
      const harness = createTicketsServiceHarness();
      const [parent, child] = await createPair(harness);
      await merge(harness, child.id, parent.id);
      const loadedParent = await load(harness, parent.id);
      const messages: TicketPersistedMessageSink = [];
      const reply = await harness.memory.prisma.ticketMessage.create({
        data: { ticketId: parent.id, type: 'AGENT_REPLY', body: 'Radimo na tome', authorUserId: ticketsTestIds.agentIt },
      });
      const note = await harness.memory.prisma.ticketMessage.create({
        data: { ticketId: parent.id, type: 'INTERNAL_NOTE', body: 'interno', authorUserId: ticketsTestIds.agentIt },
      });
      const prisma = harness.memory.prisma as never;
      expect(await copyMessageToMergedTickets({ prisma, parent: loadedParent, message: reply as never, messages })).toBe(1);
      expect(await copyMessageToMergedTickets({ prisma, parent: loadedParent, message: note as never, messages })).toBe(0);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.ticketId).toBe(child.id);
      expect(messages[0]?.body).toContain(`Poruka s ${parent.ticketNumber}`);
    });

    it('unmerges back into work', async () => {
      const harness = createTicketsServiceHarness();
      const [parent, child] = await createPair(harness);
      await merge(harness, child.id, parent.id);
      const gated = await harness.accessPolicies.bind(agent);
      const unmerged = await unmergeTicket({
        prisma: harness.memory.prisma as never,
        authorizationContextLoader: harness.authorizationContextLoader as never,
        ticketId: child.id,
        reason: 'Nije isti problem',
        context: gated,
        messages: [],
      });
      expect(unmerged.mergedIntoTicketId).toBeNull();
      expect(unmerged.status).toBe('IN_PROGRESS');
      await expect(
        unmergeTicket({
          prisma: harness.memory.prisma as never,
          authorizationContextLoader: harness.authorizationContextLoader as never,
          ticketId: child.id,
          reason: 'opet',
          context: gated,
          messages: [],
        }),
      ).rejects.toMatchObject({ code: 'TICKET_NOT_MERGED' });
    });
  });
});

async function createPair(harness: Harness) {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const first = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  const second = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  return [first, second] as const;
}

async function override(
  harness: Harness,
  ticketId: string,
  body: Parameters<typeof overrideTicketPriority>[0]['body'],
  actorUserId: string = ticketsTestIds.agentIt,
): Promise<TicketRecord> {
  return overrideTicketPriority({
    prisma: harness.memory.prisma as never,
    authorizationContextLoader: harness.authorizationContextLoader as never,
    ticketId,
    body,
    context: await harness.accessPolicies.bind({ actorUserId }),
    messages: [],
  });
}

async function merge(
  harness: Harness,
  childId: string,
  parentId: string,
  messages: TicketPersistedMessageSink = [],
  reason = 'Isti problem s VPN-om',
) {
  return mergeTicket({
    prisma: harness.memory.prisma as never,
    authorizationContextLoader: harness.authorizationContextLoader as never,
    ticketId: childId,
    parentTicketId: parentId,
    reason,
    context: await harness.accessPolicies.bind({ actorUserId: ticketsTestIds.agentIt }),
    messages,
  });
}

async function load(harness: Harness, id: string): Promise<TicketRecord> {
  return (await harness.memory.prisma.ticket.findUnique({ where: { id } })) as TicketRecord;
}

async function systemEvents(harness: Harness, ticketId: string): Promise<string[]> {
  const rows = (await harness.memory.prisma.ticketMessage.findMany({
    where: { ticketId },
  })) as { type: string; body: string }[];
  return rows.filter((row) => row.type === 'SYSTEM_EVENT').map((row) => row.body);
}
