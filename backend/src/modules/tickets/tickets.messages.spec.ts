import { ticketSystemEventActions } from './collaboration.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsCollaborationService messages', () => {
  const requester = { actorUserId: ticketsTestIds.requester };
  const agentIt = { actorUserId: ticketsTestIds.agentIt };
  const agentHr = { actorUserId: ticketsTestIds.agentHr };

  it('persists public and agent replies and hides internal/system from requesters', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const userReply = await harness.collaboration.createMessage(
      ticketId,
      { type: 'USER_REPLY', body: 'Still disconnected' },
      requester,
    );
    expect(userReply.type).toBe('USER_REPLY');
    const agentReply = await harness.collaboration.createMessage(
      ticketId,
      { type: 'AGENT_REPLY', body: 'Checking the concentrator' },
      agentIt,
    );
    const internal = await harness.collaboration.createMessage(
      ticketId,
      { type: 'INTERNAL_NOTE', body: 'Likely a stale cert' },
      agentIt,
    );
    const forRequester = await harness.collaboration.listMessages(
      ticketId,
      requester,
    );
    expect(forRequester.map((item) => item.type)).toEqual([
      'USER_REPLY',
      'AGENT_REPLY',
    ]);
    expect(forRequester.map((item) => item.id)).toEqual([
      userReply.id,
      agentReply.id,
    ]);
    expect(forRequester.some((item) => item.id === internal.id)).toBe(false);
    const forAgent = await harness.collaboration.listMessages(ticketId, agentIt);
    expect(forAgent.map((item) => item.type)).toContain('SYSTEM_EVENT');
    expect(forAgent.map((item) => item.id)).toContain(internal.id);
    expect(
      forAgent.filter((item) => item.type === 'SYSTEM_EVENT').map((item) => item.body),
    ).toContain(ticketSystemEventActions.created);
    // Review S6: `take` returns the newest messages, still oldest-first.
    const newestTwo = await harness.collaboration.listMessages(ticketId, agentIt, { take: 2 });
    expect(newestTwo.map((item) => item.id)).toEqual(forAgent.slice(-2).map((item) => item.id));
    const requesterNewest = await harness.collaboration.listMessages(ticketId, requester, { take: 1 });
    expect(requesterNewest.map((item) => item.id)).toEqual([agentReply.id]);
  });

  it('val 2 (M13/B1): ne dozvoljava deaktiviran, tuđi ili pogrešan tip šablona', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const store = installTemplateStore(harness, [
      { id: 'tpl-reply', kind: 'REPLY', isActive: true },
      { id: 'tpl-internal', kind: 'INTERNAL', isActive: true },
      { id: 'tpl-off', kind: 'REPLY', isActive: false },
      { id: 'tpl-other', kind: 'REPLY', isActive: true, ownerUserId: 'other-agent' },
    ]);

    // Interni šablon (napisan kao uputa) ne smije u javni odgovor.
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'AGENT_REPLY', body: 'Uputa', responseTemplateId: 'tpl-internal' },
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'RESPONSE_TEMPLATE_KIND_MISMATCH' } });
    // Deaktiviran šablon ostaje mrtav i poslije isključivanja u administraciji.
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'AGENT_REPLY', body: 'Stari tekst', responseTemplateId: 'tpl-off' },
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'RESPONSE_TEMPLATE_INACTIVE' } });
    // Tuđi i nepostojeći šablon se ne razlikuju (nema enumeracije).
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'AGENT_REPLY', body: 'Tuđi', responseTemplateId: 'tpl-other' },
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'RESPONSE_TEMPLATE_NOT_FOUND' } });
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'AGENT_REPLY', body: 'Nema ga', responseTemplateId: 'tpl-missing' },
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'RESPONSE_TEMPLATE_NOT_FOUND' } });

    // Ispravan par prolazi i broji upotrebu.
    const reply = await harness.collaboration.createMessage(
      ticketId,
      { type: 'AGENT_REPLY', body: 'Pozdrav', responseTemplateId: 'tpl-reply' },
      agentIt,
    );
    expect(
      harness.memory.messages.get(reply.id)?.responseTemplateId,
    ).toBe('tpl-reply');
    expect(store.get('tpl-reply')?.usageCount).toBe(1);
    // Interna bilješka smije koristiti INTERNAL šablon.
    const note = await harness.collaboration.createMessage(
      ticketId,
      { type: 'INTERNAL_NOTE', body: 'Koraci', responseTemplateId: 'tpl-internal' },
      agentIt,
    );
    expect(
      harness.memory.messages.get(note.id)?.responseTemplateId,
    ).toBe('tpl-internal');
    // Neuspjeli pokušaji nisu uvećali brojač.
    expect(store.get('tpl-internal')?.usageCount).toBe(1);
    expect(store.get('tpl-off')?.usageCount).toBe(0);
    expect(store.get('tpl-other')?.usageCount).toBe(0);
  });

  it('rejects unauthorized message access and requester internal notes', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'INTERNAL_NOTE', body: 'secret' },
        requester,
      ),
    ).rejects.toMatchObject({ response: { code: 'MESSAGE_TYPE_NOT_ALLOWED' } });
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'SYSTEM_EVENT', body: ticketSystemEventActions.created },
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_MESSAGE_TYPE' } });
    await expect(
      harness.collaboration.listMessages(ticketId, agentHr),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      harness.collaboration.createMessage(
        ticketId,
        { type: 'AGENT_REPLY', body: 'out of scope' },
        agentHr,
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('persists a message before broadcasting it', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    const order: string[] = [];
    const originalCreate = harness.memory.prisma.ticketMessage.create.bind(
      harness.memory.prisma.ticketMessage,
    );
    harness.memory.prisma.ticketMessage.create = async (args) => {
      const created = await originalCreate(args);
      order.push(`persist:${created.id}`);
      return created;
    };
    harness.realtimeHub.subscribe((payload) => {
      expect(harness.memory.messages.has(payload.id)).toBe(true);
      order.push(`broadcast:${payload.id}`);
    });
    const created = await harness.collaboration.createMessage(
      ticketId,
      { type: 'AGENT_REPLY', body: 'Persisted first' },
      agentIt,
    );
    expect(order).toEqual([
      `persist:${created.id}`,
      `broadcast:${created.id}`,
    ]);
  });
});

/**
 * Val 2 (M13/B1): the tickets harness has no template store, so the spec
 * installs a minimal one. `usageCount` is mutated the way `updateMany` would.
 */
function installTemplateStore(
  harness: ReturnType<typeof createTicketsServiceHarness>,
  rows: readonly {
    id: string;
    kind: 'REPLY' | 'INTERNAL' | 'ANY';
    isActive: boolean;
    ownerUserId?: string | null;
  }[],
) {
  const store = new Map(rows.map((row) => [row.id, { ...row, ownerUserId: row.ownerUserId ?? null, usageCount: 0 }]));
  (harness.memory.prisma as unknown as Record<string, unknown>).responseTemplate = {
    findFirst: async ({ where }: { where: { id: string; OR?: Array<{ ownerUserId: string | null }> } }) => {
      const row = store.get(where.id);
      if (row === undefined) return null;
      const owner = where.OR?.[1]?.ownerUserId;
      if (row.ownerUserId !== null && row.ownerUserId !== owner) return null;
      return { id: row.id, kind: row.kind, isActive: row.isActive };
    },
    updateMany: async ({ where }: { where: { id: string } }) => {
      const row = store.get(where.id);
      if (row === undefined) return { count: 0 };
      row.usageCount += 1;
      return { count: 1 };
    },
  };
  return store;
}

/**
 * Val 2 (M10/B4): the "first response" metric used to depend on the SLA module
 * (its clock wrote `firstResponseAt`), so with SLA off — or without a
 * profile/rule/calendar — it stayed null although agents had replied.
 */
describe('first response without SLA (val 2, M10/B4)', () => {
  it('prvi agentski odgovor upisuje firstResponseAt, dalji ga ne mijenjaju', async () => {
    const harness = createTicketsServiceHarness();
    const ticketId = await createRoutedTicket(harness);
    expect(harness.slaConfig.enabled).toBe(false);
    expect(harness.memory.tickets.get(ticketId)?.firstResponseAt).toBeNull();

    // Korisnički odgovor nije prvi odgovor službe.
    await harness.collaboration.createMessage(
      ticketId,
      { type: 'USER_REPLY', body: 'Ima li novosti?' },
      { actorUserId: ticketsTestIds.requester },
    );
    expect(harness.memory.tickets.get(ticketId)?.firstResponseAt).toBeNull();

    await harness.collaboration.createMessage(
      ticketId,
      { type: 'AGENT_REPLY', body: 'Radimo na tome' },
      { actorUserId: ticketsTestIds.agentIt },
    );
    const afterFirst = harness.memory.tickets.get(ticketId)?.firstResponseAt;
    expect(afterFirst).toBeInstanceOf(Date);

    await harness.collaboration.createMessage(
      ticketId,
      { type: 'AGENT_REPLY', body: 'Još jedan odgovor' },
      { actorUserId: ticketsTestIds.agentIt },
    );
    expect(harness.memory.tickets.get(ticketId)?.firstResponseAt).toEqual(
      afterFirst,
    );
  });
});

async function createRoutedTicket(harness: ReturnType<typeof createTicketsServiceHarness>) {
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const created = await harness.tickets.create(vpnCreateInput(), {
    actorUserId: ticketsTestIds.requester,
  });
  return created.id;
}
