import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from '../tickets/create-tickets-service-harness';
import { buildTicketRecord } from '../tickets/list/ticket-record-fixture';
import type { TicketMutationContext } from '../tickets/tickets.types';
import { searchConstants } from './search.constants';
import { describeSearchTerm, type SearchTelemetryRecord } from './search-telemetry';
import { SearchService } from './search.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { agentIt, agentHr, requester, adminIt, superAdmin } = ticketsTestIds;
const day = (n: number) => new Date(`2026-02-0${n}T00:00:00.000Z`);

/**
 * W7.62 (BA-search-08): each group can be made to fail with a chosen error, so
 * the spec can prove both sides of the partial/fail-closed contract.
 */
type GroupFailures = {
  readonly ticket?: unknown;
  readonly article?: unknown;
  readonly user?: unknown;
};

function setup(failures: GroupFailures = {}) {
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
  // W7.57 (BA-search-03): the reader answers `{ items, incomplete }` — the
  // bounded scan decides completeness, the search service only surfaces it.
  const articleState = { incomplete: false };
  const knowledgeBase = {
    searchTitles: async (query: { q: string; limit: number }) => {
      if (failures.article !== undefined) {
        throw failures.article;
      }
      articleCalls.push({ q: query.q, limit: query.limit });
      return {
        items: [{ id: 'article-1', slug: 'reset-lozinke', title: `Reset ${query.q}` }],
        incomplete: articleState.incomplete,
      };
    },
  };
  // The people group reads `user.findMany`; the harness has no user delegate,
  // so the read is provided here and records what it was asked for. The rows
  // carry their unit, because W7.55 scopes the group by organizational unit.
  const userQueries: {
    where?: { organizationalUnitId?: { in?: readonly string[] } };
    select?: { email?: boolean };
    take?: number;
  }[] = [];
  const unitQueries: unknown[] = [];
  const ouItSupport = 'ou-it-support';
  const users = [
    {
      id: 'user-1',
      displayName: 'Ana Hodžić',
      email: 'ana@example.com',
      organizationalUnitId: ticketsTestIds.ouIt,
    },
    {
      id: 'user-2',
      displayName: 'Marko Marković',
      email: 'marko@example.com',
      organizationalUnitId: ticketsTestIds.ouHr,
    },
    {
      id: 'user-3',
      displayName: 'Ana Support',
      email: 'ana.support@example.com',
      organizationalUnitId: ouItSupport,
    },
  ];
  const organizationalUnits = [
    { id: ticketsTestIds.ouRoot, ouPath: '/Korisnici' },
    { id: ticketsTestIds.ouIt, ouPath: '/Korisnici/IT' },
    { id: ouItSupport, ouPath: '/Korisnici/IT/Support' },
    { id: ticketsTestIds.ouHr, ouPath: '/Korisnici/HR' },
  ];
  const prisma = {
    user: {
      findMany: async (args: {
        where?: { organizationalUnitId?: { in?: readonly string[] } };
        select?: { email?: boolean };
        take?: number;
      }) => {
        if (failures.user !== undefined) {
          throw failures.user;
        }
        userQueries.push(args);
        const scope = args.where?.organizationalUnitId?.in;
        const select = args.select ?? {};
        const needle = /contains":"([^"]*)"/.exec(
          JSON.stringify(args.where ?? {}),
        )?.[1];
        const take = args.take ?? 15;
        return users
          .filter((user) =>
            scope === undefined
              ? true
              : scope.includes(user.organizationalUnitId),
          )
          .filter((user) =>
            needle === undefined
              ? true
              : `${user.displayName} ${user.email}`
                  .toLowerCase()
                  .includes(needle.toLowerCase()),
          )
          .slice(0, take)
          .map((user) =>
            select.email === true
              ? user
              : { id: user.id, displayName: user.displayName },
          );
      },
    },
    organizationalUnit: {
      findMany: async (args: unknown) => {
        unitQueries.push(args);
        return organizationalUnits;
      },
    },
  };
  const ticketReader =
    failures.ticket === undefined
      ? harness.tickets
      : ({
          searchTickets: async () => {
            throw failures.ticket;
          },
        } as never);
  // W7.112 (BA-search-11): the telemetry sink is a spy, so the spec can read
  // exactly what would be logged. It hashes with a fixed salt, like the real
  // class, and keeps the record instead of formatting it.
  const telemetryRecords: SearchTelemetryRecord[] = [];
  const telemetry = {
    describeTerm: (term: string) => describeSearchTerm(term, 'spec-salt'),
    record: (record: SearchTelemetryRecord) => {
      telemetryRecords.push(record);
    },
  };
  const service = new SearchService(
    prisma as never,
    authorizationContextLoader as never,
    ticketReader as never,
    knowledgeBase as never,
    telemetry as never,
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
    articleState,
    userQueries,
    unitQueries,
    context,
    telemetryRecords,
    telemetry,
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
    // The knowledge-base reader receives the needle and the limit only: the
    // candidate window is the reader's own bounded scan (W7.57), not a
    // multiplier handed down by the search service.
    expect(articleCalls).toEqual([{ q: 'vpn', limit: 15 }]);
    expect(articlesOnly.articlesIncomplete).toBe(false);
  });

  it('reads each group once when a hand-built query repeats a type (W7.111)', async () => {
    // BA-search-10: the DTO now refuses duplicates, but `search()` is also called
    // from tests and future internal callers. The `Set` must keep one read per
    // group, otherwise a repeated type would double the cost of the heaviest
    // group and could report the same group twice.
    const { service, articleCalls, userQueries, context } = setup();
    const found = await service.search(
      {
        q: 'vpn',
        types: ['article', 'ticket', 'article', 'user', 'user'],
        limit: searchConstants.defaultLimit,
      },
      // A scoped administrator: the people group has a directory grant, so the
      // repeated `user` would be visible as a second read if the `Set` were gone.
      context(adminIt),
    );
    expect(articleCalls).toEqual([{ q: 'vpn', limit: searchConstants.defaultLimit }]);
    expect(userQueries).toHaveLength(1);
    expect(found.articles).toHaveLength(1);
    expect(found.tickets.length).toBeGreaterThan(0);
    expect(found.failedGroups).toEqual([]);
  });

  it('surfaces an incomplete article group instead of claiming completeness', async () => {
    const { service, articleState, context } = setup();
    articleState.incomplete = true;
    const found = await service.search(
      { q: 'vpn', types: ['article'], limit: 15 },
      context(agentIt),
    );
    // The group is still answered; the flag says the scan stopped early.
    expect(found.articles).toHaveLength(1);
    expect(found.articlesIncomplete).toBe(true);

    // A group that was not requested is absent, not incomplete.
    const ticketsOnly = await service.search(
      { q: 'vpn', types: ['ticket'], limit: 15 },
      context(agentIt),
    );
    expect(ticketsOnly.articlesIncomplete).toBe(false);
  });

  it('answers the people group only to the roles that may read the directory', async () => {
    const { service, userQueries, context } = setup();
    const asAgent = await service.search(
      { q: 'ana', types: ['user'], limit: 15 },
      context(agentIt),
    );
    expect(asAgent.users).toEqual([]);
    // Not allowed means not read: no query at all.
    expect(userQueries).toEqual([]);

    const asAdmin = await service.search(
      { q: 'ana', types: ['user'], limit: 15 },
      context(adminIt),
    );
    // The IT admin finds the IT user and the IT/Support child, never HR.
    expect(asAdmin.users.map((user) => user.displayName)).toEqual([
      'Ana Hodžić',
      'Ana Support',
    ]);
    expect(asAdmin.users.map((user) => user.email)).toEqual([null, null]);

    const asSuperAdmin = await service.search(
      { q: 'marko', types: ['user'], limit: 15 },
      context(superAdmin),
    );
    expect(asSuperAdmin.users.map((user) => user.displayName)).toEqual([
      'Marko Marković',
    ]);
    // A global reach carries the e-mail column.
    expect(asSuperAdmin.users.map((user) => user.email)).toEqual([
      'marko@example.com',
    ]);
  });

  it('never lets a scoped administrator discover a user of another unit', async () => {
    const { service, userQueries, context } = setup();
    const asAdmin = await service.search(
      { q: 'marko', types: ['user'], limit: 15 },
      context(adminIt),
    );
    // The name matches, the scope does not: the row is filtered in the query.
    expect(asAdmin.users).toEqual([]);
    expect(userQueries).toHaveLength(1);
    expect(
      (userQueries[0].where as { organizationalUnitId?: { in?: string[] } })
        .organizationalUnitId?.in,
    ).toEqual(['ou-it', 'ou-it-support']);
    // The e-mail column is not even read when the reach is a unit subtree.
    expect(userQueries[0].select).toEqual({ id: true, displayName: true });

    const asHrAdmin = await service.search(
      { q: 'ana', types: ['user'], limit: 15 },
      context(adminIt),
    );
    expect(asHrAdmin.users.map((user) => user.displayName)).toEqual([
      'Ana Hodžić',
      'Ana Support',
    ]);
  });

  it('reads the unit table only when the grant is unit-scoped', async () => {
    const { service, unitQueries, context } = setup();
    await service.search(
      { q: 'marko', types: ['user'], limit: 15 },
      context(superAdmin),
    );
    expect(unitQueries).toEqual([]);

    await service.search(
      { q: 'ana', types: ['user'], limit: 15 },
      context(adminIt),
    );
    expect(unitQueries).toHaveLength(1);
  });

  it('lets the explicit permission decide instead of the role name', async () => {
    const { service, contexts, context } = setup();
    const subjectId = 'user-agent-directory-it';
    contexts.set(
      subjectId,
      createTestAuthorizationContext({
        subjectId,
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.agent,
            organizationalUnitId: ticketsTestIds.ouIt,
            organizationalUnitPath: '/Korisnici/IT',
            permissionKeys: [permissionKeys.userDirectoryRead],
          }),
        ],
      }),
    );
    const asGrantedAgent = await service.search(
      { q: 'ana', types: ['user'], limit: 15 },
      context(subjectId),
    );
    expect(asGrantedAgent.users.map((user) => user.displayName)).toEqual([
      'Ana Hodžić',
      'Ana Support',
    ]);
    expect(asGrantedAgent.users.map((user) => user.email)).toEqual([
      null,
      null,
    ]);
  });

  it('refuses a query that has no two characters of content', async () => {
    const { service, userQueries, articleCalls, context } = setup();
    // W7.56: the HTTP DTO already refuses these; the service repeats the rule so
    // a hand-built query can never reach an empty `contains`.
    for (const q of ['', '   ', ' a', '\u200b\u200b']) {
      await expect(
        service.search(
          { q, types: [...allTypes], limit: searchConstants.defaultLimit },
          context(superAdmin),
        ),
      ).rejects.toMatchObject({ status: 400 });
    }
    // Rejected means "not read": no group ran.
    expect(userQueries).toEqual([]);
    expect(articleCalls).toEqual([]);
  });

  it('normalizes the needle it sends to the groups', async () => {
    const { service, articleCalls, context } = setup();
    const found = await service.search(
      { q: '  \uff36\uff30\uff2e\u00a0pristup ', types: ['article'], limit: 15 },
      context(agentIt),
    );
    expect(found.articles).toHaveLength(1);
    expect(articleCalls).toEqual([{ q: 'VPN pristup', limit: 15 }]);
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

  /**
   * W7.62 (BA-search-08): one dependency failing used to take the whole answer
   * down. The contract is now explicit in both directions: an availability
   * failure degrades to a named partial group, an authorization failure still
   * fails the request, and a request where nothing could be read says so instead
   * of pretending that nothing matched.
   */
  describe('partial and fail-closed contract (W7.62)', () => {
    it('answers the healthy groups and names the unavailable one', async () => {
      const { service, context } = setup({
        article: new Error('knowledge base connection refused'),
      });
      const found = await service.search(
        { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
        context(agentIt),
      );
      // The ticket group still answered...
      expect(found.tickets.map((ticket) => ticket.id)).toEqual(['t1', 't2']);
      // ...the failed group is empty but named, so the empty array cannot be
      // read as "no articles match".
      expect(found.articles).toEqual([]);
      expect(found.failedGroups).toEqual(['article']);
      // The scan-completeness flag belongs to a group that answered.
      expect(found.articlesIncomplete).toBe(false);
    });

    it('fails the whole request when a group is denied', async () => {
      const { service, context } = setup({ article: new ForbiddenException() });
      await expect(
        service.search(
          { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
          context(agentIt),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('answers 503 when every requested group is unavailable', async () => {
      const unavailable = new Error('database is down');
      const { service, context } = setup({
        ticket: unavailable,
        article: unavailable,
        user: unavailable,
      });
      const error = await service
        .search(
          { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
          context(adminIt),
        )
        .catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        (error as ServiceUnavailableException).getResponse(),
      ).toMatchObject({
        code: 'SEARCH_UNAVAILABLE',
        details: { failedGroups: ['ticket', 'article', 'user'] },
      });
    });

    it('never lists a group that was not requested and reports success explicitly', async () => {
      // The article reader is broken, but the caller asked for tickets only:
      // the failure is never reached, so it cannot be reported.
      const { service, context } = setup({ article: new Error('boom') });
      const ticketsOnly = await service.search(
        { q: 'vpn', types: ['ticket'], limit: searchConstants.defaultLimit },
        context(agentIt),
      );
      expect(ticketsOnly.failedGroups).toEqual([]);
      expect(ticketsOnly.tickets.length).toBeGreaterThan(0);

      // A fully successful answer carries the field, as an empty list.
      const healthy = await setup().service.search(
        { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
        context(agentIt),
      );
      expect(healthy.failedGroups).toEqual([]);
    });
  });

  describe('telemetry (W7.112)', () => {
    it('records one privacy-safe record per answered request', async () => {
      const { service, telemetryRecords, context } = setup();
      const found = await service.search(
        { q: 'vpn pristup', types: [...allTypes], limit: searchConstants.defaultLimit },
        context(agentIt),
      );
      expect(telemetryRecords).toHaveLength(1);
      const [record] = telemetryRecords;
      expect(record?.status).toBe('ok');
      // The needle is represented by its length and a keyed hash — the raw term
      // is nowhere in the record (acceptance §14.8 of the audit).
      expect(record?.queryLength).toBe('vpn pristup'.length);
      expect(record?.queryHash).toMatch(/^[0-9a-f]{16}$/);
      expect(JSON.stringify(record)).not.toContain('vpn');
      expect(record?.requestedTypes).toEqual(['ticket', 'article', 'user']);
      expect(record?.limit).toBe(searchConstants.defaultLimit);
      expect(record?.durationMs).toBeGreaterThanOrEqual(0);
      const ticketGroup = record?.groups.find((group) => group.group === 'ticket');
      expect(ticketGroup).toMatchObject({
        state: 'ok',
        hits: found.tickets.length,
        truncated: false,
      });
    });

    it('marks a capped group as truncated and a stopped scan as incomplete', async () => {
      const { service, telemetryRecords, articleState, context } = setup();
      articleState.incomplete = true;
      await service.search(
        { q: 'vpn', types: ['ticket', 'article'], limit: 1 },
        context(agentIt),
      );
      const [record] = telemetryRecords;
      // `limit=1` with two matching tickets: the answer may hide a third one.
      expect(record?.groups.find((group) => group.group === 'ticket')).toMatchObject({
        state: 'ok',
        hits: 1,
        truncated: true,
      });
      expect(record?.groups.find((group) => group.group === 'article')).toMatchObject({
        state: 'ok',
        truncated: true,
      });
      // Not requested is not "empty": no hits, no duration, not incomplete.
      expect(record?.groups.find((group) => group.group === 'user')).toMatchObject({
        state: 'skipped',
        hits: 0,
        durationMs: 0,
        truncated: false,
      });
      expect(record?.requestedTypes).toEqual(['ticket', 'article']);
    });

    it('records a partial answer as partial and names the failed group', async () => {
      const { service, telemetryRecords, context } = setup({
        article: new Error('kb down'),
      });
      const found = await service.search(
        { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
        context(agentIt),
      );
      expect(found.failedGroups).toEqual(['article']);
      const [record] = telemetryRecords;
      expect(record?.status).toBe('partial');
      expect(record?.groups.find((group) => group.group === 'article')).toMatchObject({
        state: 'failed',
        hits: 0,
      });
      expect(record?.groups.find((group) => group.group === 'ticket')?.state).toBe('ok');
    });

    it('records a 503 as unavailable and a fatal failure as rejected', async () => {
      const unavailable = new Error('all down');
      const down = setup({
        ticket: unavailable,
        article: unavailable,
        user: unavailable,
      });
      await expect(
        down.service.search(
          { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
          down.context(adminIt),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(down.telemetryRecords[0]?.status).toBe('unavailable');

      // A security decision is not a partial answer: the request ends there, and
      // the line says so instead of looking like an empty success.
      const denied = setup({ ticket: new ForbiddenException('no') });
      await expect(
        denied.service.search(
          { q: 'vpn', types: [...allTypes], limit: searchConstants.defaultLimit },
          denied.context(agentIt),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(denied.telemetryRecords[0]?.status).toBe('rejected');
      expect(
        denied.telemetryRecords[0]?.groups.find((group) => group.group === 'ticket'),
      ).toMatchObject({ state: 'failed' });
    });

    it('never lets a broken sink change the answer', async () => {
      const { service, telemetry, context } = setup();
      telemetry.record = () => {
        throw new Error('logger exploded');
      };
      const withBrokenSink = await service.search(
        { q: 'vpn', types: ['ticket'], limit: searchConstants.defaultLimit },
        context(agentIt),
      );
      expect(withBrokenSink.tickets.length).toBeGreaterThan(0);

      telemetry.describeTerm = () => {
        throw new Error('salt reader exploded');
      };
      const withBrokenSalt = await service.search(
        { q: 'vpn', types: ['ticket'], limit: searchConstants.defaultLimit },
        context(agentIt),
      );
      expect(withBrokenSalt.tickets.length).toBeGreaterThan(0);
    });
  });
});
