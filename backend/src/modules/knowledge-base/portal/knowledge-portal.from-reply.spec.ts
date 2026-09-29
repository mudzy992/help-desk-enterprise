import { createKnowledgeBaseServiceHarness, knowledgeBaseTestIds } from '../create-knowledge-base-service-harness';
import { KnowledgePortalService } from './knowledge-portal.service';

jest.mock('../../tickets/load-accessible-ticket', () => ({
  loadAccessibleTicket: jest.fn(),
}));
import { loadAccessibleTicket } from '../../tickets/load-accessible-ticket';

const ticket = {
  id: 'ticket-1',
  ticketNumber: 'HD-2026-000042',
  title: 'VPN ne radi za Amra Hodžić',
  serviceId: knowledgeBaseTestIds.serviceVpn,
  originUnitId: knowledgeBaseTestIds.ouIt,
  requesterId: 'user-amra',
  isConfidential: false,
};

function setup(options: { visibility?: 'staff' | 'public'; confidential?: boolean; type?: string } = {}) {
  const harness = createKnowledgeBaseServiceHarness();
  (loadAccessibleTicket as jest.Mock).mockResolvedValue({
    ticket: { ...ticket, isConfidential: options.confidential ?? false },
    access: { visibility: options.visibility ?? 'staff' },
  });
  const messages: unknown[] = [];
  const audits: unknown[] = [];
  const prisma = harness.memory.prisma as unknown as Record<string, unknown>;
  prisma.ticketMessage = {
    findUnique: async () => ({
      id: 'msg-1',
      ticketId: 'ticket-1',
      type: options.type ?? 'AGENT_REPLY',
      body: 'Amra Hodžić: pokrenite klijent, server 10.1.2.3, pozovite +387 33 123 456 ili pisite na amra.hodzic@example.com.',
      authorUserId: knowledgeBaseTestIds.agentIt,
    }),
    create: async ({ data }: { data: unknown }) => (messages.push(data), data),
  };
  prisma.ticketParticipant = { findMany: async () => [] };
  const users = prisma.user as Record<string, unknown>;
  users.findMany = async () => [
    { id: 'user-amra', email: 'amra.hodzic@example.com', displayName: 'Amra Hodžić', distinguishedName: null },
  ];
  const originalFindUnique = users.findUnique as (args: unknown) => Promise<unknown>;
  users.findUnique = async (args: { where: { id: string }; select?: Record<string, boolean> }) =>
    args.select?.preferredLocale ? { preferredLocale: 'bs' } : originalFindUnique(args);
  prisma.$executeRaw = async () => 0;
  prisma.auditLog = { findFirst: async () => null, create: async ({ data }: { data: unknown }) => audits.push(data) };
  const service = new KnowledgePortalService(
    harness.memory.prisma as never,
    { loadBySubjectId: async (id: string) => harness.contexts.get(id) ?? null } as never,
    { load: async () => ({ ...harness.configuration }) } as never,
    { getSetting: async () => undefined } as never,
  );
  return { ...harness, service, messages, audits };
}

const agent = { actorUserId: knowledgeBaseTestIds.agentIt };

describe('Article from a public agent reply (K1c)', () => {
  it('previews a scrubbed draft with per-kind counts', async () => {
    const { service } = setup();
    const draft = await service.draftFromReply('ticket-1', 'msg-1', agent);
    expect(draft.title).toBe('VPN ne radi za [korisnik]');
    expect(draft.body).toBe(
      '[korisnik]: pokrenite klijent, server [IP adresa], pozovite [telefon] ili pisite na [e-mail].',
    );
    expect(draft.replacements).toEqual({ email: 1, person: 2, ip: 1, phone: 1 });
    expect(draft).toMatchObject({ serviceId: ticket.serviceId, organizationalUnitId: ticket.originUnitId });
  });

  it('refuses internal notes, requester access and confidential tickets', async () => {
    await expect(setup({ type: 'INTERNAL_NOTE' }).service.draftFromReply('ticket-1', 'msg-1', agent)).rejects.toMatchObject({
      response: { code: 'SOURCE_MESSAGE_NOT_PUBLIC' },
    });
    await expect(setup({ visibility: 'public' }).service.draftFromReply('ticket-1', 'msg-1', agent)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    await expect(setup({ confidential: true }).service.draftFromReply('ticket-1', 'msg-1', agent)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
  });

  it('creates a DRAFT with the source and leaves an internal trace on the ticket', async () => {
    const { service, messages, audits } = setup();
    const created = await service.createFromReply(
      {
        ticketId: 'ticket-1',
        messageId: 'msg-1',
        title: 'VPN klijent',
        body: 'Pokrenite klijent.',
        serviceId: knowledgeBaseTestIds.serviceVpn,
        organizationalUnitId: knowledgeBaseTestIds.ouIt,
        ownerUserId: knowledgeBaseTestIds.agentIt,
        reason: 'Iz odgovora',
      },
      agent,
    );
    expect(created).toMatchObject({ status: 'DRAFT', sourceTicketId: 'ticket-1', sourceMessageId: 'msg-1' });
    expect(messages).toEqual([
      expect.objectContaining({
        ticketId: 'ticket-1',
        type: 'SYSTEM_EVENT',
        body: `ticket_knowledge_draft_created:${created.id}|VPN klijent`,
      }),
    ]);
    expect(audits).toHaveLength(1);
  });
});
