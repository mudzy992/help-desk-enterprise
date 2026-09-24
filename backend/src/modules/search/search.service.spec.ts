import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../tickets/create-tickets-service-harness';
import { buildTicketRecord } from '../tickets/list/ticket-record-fixture';
import type { TicketMutationContext } from '../tickets/tickets.types';
import { searchConstants } from './search.constants';
import { SearchService } from './search.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { agentIt, agentHr, requester, adminIt, superAdmin } = ticketsTestIds;
const day = (n: number) => new Date(`2026-02-0${n}T00:00:00.000Z`);

function setup() {
  const harness = createTicketsServiceHarness();
  const { memory, contexts, authorizationContextLoader } = harness;
  const seed = (
    id: string,
    overrides: Partial<Parameters<typeof buildTicketRecord>[0]>,
  ) =>
    memory.tickets.set(
      id,
      buildTicketRecord({
        id,
        ticketNumber: `T-${id}`,
        createdAt: day(1),
        updatedAt: day(1),
        ...overrides,
      }),
    );
  seed('t1', { title: 'VPN pristup', originUnitId: ticketsTestIds.ouIt });
  seed('t2', { title: 'vpn sporo radi', originUnitId: ticketsTestIds.ouIt });
  seed('t3', { title: 'HR onboarding', originUnitId: ticketsTestIds.ouHr });
  seed('t4', { title: 'Arhivirano', status: 'ARCHIVED', originUnitId: ticketsTestIds.ouIt });
  // The article group is stubbed: this spec is about the wiring and about the
  // ticket scope, while the visibility of articles has its own tests.
  const articleCalls: { q: string; limit: number }[] = [];
  const knowledgeBase = {
    searchTitles: async (query: { q: string; limit: number }) => {
      articleCalls.push({ q: query.q, limit: query.limit });
      return [{ id: 'article-1', slug: 'reset-lozinke', title: `Reset ${query.q}` }];
    },
  };
  // The people group reads `user.findMany`; the harness has no user delegate,
  // so the read is provided here and records what it was asked for.
  const userQueries: unknown[] = [];
  const users = [
    { id: 'user-1', displayName: 'Ana Hodžić', email: 'ana@example.com' },
    { id: 'user-2', displayName: 'Marko Marković', email: 'marko@example.com' },
  ];
  const prisma = {
    user: {
      findMany: async (args: { where?: unknown; take?: number }) => {
        userQueries.push(args);
        const needle = /contains":"([^"]*)"/.exec(
          JSON.stringify(args.where ?? {}),
        )?.[1];
        const take = args.take ?? 15;
        return users
          .filter((user) =>
            needle === undefined
              ? true
              : `${user.displayName} ${user.email}`
                  .toLowerCase()
                  .includes(needle.toLowerCase()),
          )
          .slice(0, take);
      },
    },
  };
  const service = new SearchService(
    prisma as never,
    authorizationContextLoader as never,
    harness.tickets,
    knowledgeBase as never,
  );
  const context = (actorUserId: string): TicketMutationContext => ({
    actorUserId,
  });
  return {
    service,
    memory,
    contexts,
    // The ticket service itself is returned so the specs can compare what the
    // search answers with what `GET /tickets` answers.
    tickets: harness.tickets,
    articleCalls,
    userQueries,
    context,
  };
}

const allTypes = ['ticket', 'article', 'user'] as const;

describe('GET /search', () => {
  it('returns only the tickets of the caller scope', async () => {
    const { service, context } = setup();
    const it = await service.search(
      { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
      context(agentIt),
    );
    // t4 is archived (not searchable) and t3 is another unit.
    expect(it.tickets.map((ticket) => ticket.id)).toEqual(['t1', 't2']);

    const hr = await service.search(
      { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
      context(agentHr),
    );
    // The HR agent sees no IT ticket even though both titles match.
    expect(hr.tickets).toEqual([]);

    const superUser = await service.search(
      { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
      context(superAdmin),
    );
    // A super admin may see the archive; the archived ticket still matches only
    // by title, which is what the query searches.
    expect(superUser.tickets.map((ticket) => ticket.id)).toEqual(['t1', 't2']);
  });

  it('answers exactly the tickets the list would answer, page size aside', async () => {
    const { service, tickets, context } = setup();
    for (const actor of [agentIt, agentHr, superAdmin]) {
      const listed = await tickets.listPage({ q: 'vpn', pageSize: 50 }, context(actor));
      const found = await service.search(
        { q: 'vpn', types: ['ticket'], limit: searchConstants.defaultLimit },
        context(actor),
      );
      expect(found.tickets.map((ticket) => ticket.id)).toEqual(
        listed.items.map((ticket) => ticket.id),
      );
    }
  });

  it('agrees with the list for a requester: no ticket that GET /tickets would not show', async () => {
    const { service, memory, tickets, context } = setup();
    memory.tickets.set(
      't5',
      buildTicketRecord({
        id: 't5',
        ticketNumber: 'T-t5',
        title: 'vpn za mene',
        requesterId: requester,
        createdAt: day(2),
        updatedAt: day(2),
      }),
    );
    // The plan asks for the very same visibility as the list; comparing the two
    // reads is the strongest way to say that (a requester does list the public
    // tickets of the units they see).
    const listed = await tickets.listPage(
      { q: 'vpn', pageSize: 50 },
      context(requester),
    );
    const found = await service.search(
      { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
      context(requester),
    );
    expect(found.tickets.map((ticket) => ticket.id)).toEqual(
      listed.items.map((ticket) => ticket.id),
    );
    expect(found.tickets.map((ticket) => ticket.id)).toContain('t5');
  });

  it('honors the limit and skips the groups that were not asked for', async () => {
    const { service, articleCalls, userQueries, context } = setup();
    const limited = await service.search(
      { q: 'vpn', types: ['ticket'], limit: 1 },
      context(agentIt),
    );
    expect(limited.tickets).toHaveLength(1);
    expect(limited.articles).toEqual([]);
    expect(limited.users).toEqual([]);
    // Not asked for means not read: no article call, no user query.
    expect(articleCalls).toEqual([]);
    expect(userQueries).toEqual([]);

    const articlesOnly = await service.search(
      { q: 'vpn', types: ['article'], limit: 15 },
      context(agentIt),
    );
    expect(articlesOnly.articles).toHaveLength(1);
    expect(articlesOnly.tickets).toEqual([]);
    // The knowledge-base reader receives the multiplier that bounds its
    // candidate read before the visibility filter.
    expect(articleCalls).toEqual([{ q: 'vpn', limit: 15 }]);
  });

  it('answers the people group only to the roles that may read the directory', async () => {
    const { service, userQueries, context } = setup();
    const asAgent = await service.search(
      { q: 'ana', types: ['user'], limit: 15 },
      context(agentIt),
    );
    expect(asAgent.users).toEqual([]);
    expect(userQueries).toEqual([]);

    const asAdmin = await service.search(
      { q: 'ana', types: ['user'], limit: 15 },
      context(adminIt),
    );
    expect(asAdmin.users.map((user) => user.displayName)).toEqual(['Ana Hodžić']);

    const asSuperAdmin = await service.search(
      { q: 'marko', types: ['user'], limit: 15 },
      context(superAdmin),
    );
    expect(asSuperAdmin.users.map((user) => user.displayName)).toEqual([
      'Marko Marković',
    ]);
  });

  it('fails closed for an actor that authorization does not know', async () => {
    const { service, tickets, context } = setup();
    // Same outcome as the list: FORBIDDEN, not an empty answer that could be
    // mistaken for "nothing matches".
    await expect(
      tickets.listPage({ q: 'vpn' }, context('user-unknown')),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.search(
        { q: 'vpn', types: [...allTypes], limit: 15 },
        context('user-unknown'),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
