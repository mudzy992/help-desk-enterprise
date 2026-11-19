import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { knowledgeBaseConstants } from './knowledge-base.constants';
import { publishedArticleSeed } from './published-article-seed';
import { knowledgeArticleTitleSearchSelect } from './search-knowledge-article-projection';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const { agentIt, superAdmin, ouHr } = knowledgeBaseTestIds;
const base = new Date('2026-09-11T12:00:00.000Z');
/** Minutes before `base`, so a bigger number is an older row. */
const at = (minutes: number) => new Date(base.getTime() - minutes * 60_000);
const pad = (index: number) => String(index).padStart(3, '0');

type FakeDelegate = { findMany: (...args: never[]) => unknown };

/**
 * W7.57 (BA-search-03): the old read took `limit × 3` title matches, ordered by
 * `updatedAt desc`, and filtered by visibility afterwards. When those first rows
 * belonged to another scope the caller got an empty group although older
 * *visible* matches existed, and nothing in the answer said the list had been
 * cut. The spec pins the new behaviour: a bounded keyset walk that continues
 * past invisible rows, one batched visibility check per batch, and an explicit
 * `incomplete` flag whenever the scan stops early.
 */
describe('Knowledge base — bounded title search for GET /search (W7.57)', () => {
  /**
   * Rows the IT agent may not read: `CONFIDENTIAL` articles of the HR unit. A
   * published `INTERNAL` article is readable by every signed-in actor (that is
   * the product rule), so classification + unit scope is what makes a candidate
   * invisible here.
   */
  const seedInvisible = (
    memory: ReturnType<typeof createKnowledgeBaseServiceHarness>['memory'],
    count: number,
    options: { readonly title?: string; readonly startAt?: number } = {},
  ) => {
    for (let index = 0; index < count; index += 1) {
      // Newest rows are the invisible ones — exactly the ordering that made the
      // old candidate window useless for the IT agent.
      memory.seedArticle(
        publishedArticleSeed({
          id: `hr-${pad(index)}`,
          slug: `hr-${pad(index)}`,
          title: options.title ?? 'VPN upitnik za upravu',
          classification: 'CONFIDENTIAL',
          organizationalUnitId: ouHr,
          updatedAt: at((options.startAt ?? 0) + index),
        }),
      );
    }
  };

  it('finds a visible hit that sits behind more invisible candidates than the old window', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    // 60 invisible rows: well past the 24 candidates the removed
    // `limit × candidateMultiplier` window (8 × 3) would have read.
    seedInvisible(memory, 60);
    memory.seedArticle(
      publishedArticleSeed({
        id: 'it-visible',
        slug: 'it-visible',
        title: 'VPN pristup',
        updatedAt: at(500),
      }),
    );

    const found = await articles.searchTitles(
      { q: 'vpn', limit: 8 },
      { actorUserId: agentIt },
    );

    expect(found.items.map((item) => item.id)).toEqual(['it-visible']);
    // Every matching row was scanned, so the group is exhaustive and says so.
    expect(found.incomplete).toBe(false);
  });

  it('reads the table in bounded keyset batches and checks visibility once per batch', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    // 120 invisible rows: three batches, none of them filled by a hit.
    seedInvisible(memory, 120);
    const prisma = memory.prisma as unknown as {
      knowledgeArticle: FakeDelegate;
      service: FakeDelegate;
    };
    const articleFindMany = jest.spyOn(prisma.knowledgeArticle, 'findMany');
    const serviceFindMany = jest.spyOn(prisma.service, 'findMany');

    const found = await articles.searchTitles(
      { q: 'vpn', limit: 8 },
      { actorUserId: agentIt },
    );

    expect(found.items).toEqual([]);
    // The corpus fits the budget (120 ≤ 200), so the answer is complete even
    // though it is empty — the two cases the audit asked not to conflate.
    expect(found.incomplete).toBe(false);
    expect(articleFindMany).toHaveBeenCalledTimes(3);
    for (const call of articleFindMany.mock.calls) {
      const args = call[0] as { select?: Record<string, boolean> };
      expect(args).toMatchObject({
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: knowledgeBaseConstants.listScanBatchSize + 1,
      });
      // W7.58 (BA-search-04): every batch reads the projection, never the row.
      expect(args.select).toEqual(knowledgeArticleTitleSearchSelect);
      expect(args.select).not.toHaveProperty('body');
    }
    // Keyset, not offset: the second read resumes strictly after the last row.
    expect(articleFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        title: { contains: 'vpn', mode: 'insensitive' },
        status: { not: 'ARCHIVED' },
      },
    });
    expect(articleFindMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        OR: [
          { updatedAt: { lt: at(knowledgeBaseConstants.listScanBatchSize - 1) } },
          {
            updatedAt: at(knowledgeBaseConstants.listScanBatchSize - 1),
            id: { gt: `hr-${pad(knowledgeBaseConstants.listScanBatchSize - 1)}` },
          },
        ],
      },
    });
    // One service read per batch (50 rows) instead of one per row: the old
    // per-row `isKnowledgeArticleVisibleTo` would have cost 360 queries here.
    expect(serviceFindMany).toHaveBeenCalledTimes(3);
  });

  it('never reads the article text of a candidate it may not show', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    // A canary in the body of an article the IT agent may not read: if the query
    // had no projection, the text would be materialized (and could leak into a
    // debug dump) before the visibility decision excluded it.
    memory.seedArticle(
      publishedArticleSeed({
        id: 'hr-secret',
        slug: 'hr-secret',
        title: 'VPN upitnik za upravu',
        body: 'CANARY-BODY-7b1d',
        classification: 'CONFIDENTIAL',
        organizationalUnitId: ouHr,
        updatedAt: at(1),
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'it-visible',
        slug: 'it-visible',
        title: 'VPN pristup',
        body: 'CANARY-BODY-visible',
        updatedAt: at(2),
      }),
    );
    const prisma = memory.prisma as unknown as { knowledgeArticle: FakeDelegate };
    const articleFindMany = jest.spyOn(prisma.knowledgeArticle, 'findMany');

    const found = await articles.searchTitles(
      { q: 'VPN', limit: 8 },
      { actorUserId: agentIt },
    );

    // Only the visible article is answered, and the group is complete.
    expect(found.items.map((item) => item.id)).toEqual(['it-visible']);
    expect(found.incomplete).toBe(false);
    // The query asked for the projection — `body` is not among the columns.
    for (const call of articleFindMany.mock.calls) {
      const args = call[0] as { select?: Record<string, boolean> };
      expect(args.select).toEqual(knowledgeArticleTitleSearchSelect);
      expect(args.select).not.toHaveProperty('body');
    }
    // The answer is a title match: three columns, no text.
    expect(Object.keys(found.items[0] ?? {}).sort()).toEqual(['id', 'slug', 'title']);
    expect(JSON.stringify(found)).not.toContain('CANARY-BODY');
  });

  it('says the group is incomplete when the scan budget runs out', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    const cap =
      knowledgeBaseConstants.listScanBatchSize *
      knowledgeBaseConstants.maximumListScanBatches;
    // One row more than the budget: the scan cannot prove it saw everything.
    seedInvisible(memory, cap + 1);
    const prisma = memory.prisma as unknown as { knowledgeArticle: FakeDelegate };
    const articleFindMany = jest.spyOn(prisma.knowledgeArticle, 'findMany');

    const found = await articles.searchTitles(
      { q: 'vpn', limit: 8 },
      { actorUserId: agentIt },
    );

    expect(found.items).toEqual([]);
    expect(found.incomplete).toBe(true);
    // Bounded: never more than the documented number of batches.
    expect(articleFindMany).toHaveBeenCalledTimes(
      knowledgeBaseConstants.maximumListScanBatches,
    );
    expect(cap).toBe(200);
  });

  it('says the group is complete when the budget covers the whole corpus', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    const cap =
      knowledgeBaseConstants.listScanBatchSize *
      knowledgeBaseConstants.maximumListScanBatches;
    seedInvisible(memory, cap);

    const found = await articles.searchTitles(
      { q: 'vpn', limit: 8 },
      { actorUserId: agentIt },
    );

    expect(found.items).toEqual([]);
    // Exactly at the cap and nothing left: complete, not "unknown".
    expect(found.incomplete).toBe(false);
  });

  it('fills the limit and reports the rest as incomplete', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    for (let index = 0; index < 12; index += 1) {
      memory.seedArticle(
        publishedArticleSeed({
          id: `it-${pad(index)}`,
          slug: `it-${pad(index)}`,
          title: 'VPN pristup',
          updatedAt: at(index),
        }),
      );
    }

    const limited = await articles.searchTitles(
      { q: 'VPN', limit: 5 },
      { actorUserId: agentIt },
    );
    expect(limited.items.map((item) => item.id)).toEqual([
      'it-000',
      'it-001',
      'it-002',
      'it-003',
      'it-004',
    ]);
    expect(limited.incomplete).toBe(true);

    // The same corpus with a limit that fits: nothing was hidden.
    const whole = await articles.searchTitles(
      { q: 'VPN', limit: 12 },
      { actorUserId: agentIt },
    );
    expect(whole.items).toHaveLength(12);
    expect(whole.incomplete).toBe(false);
  });

  it('never returns an archived hit, whatever the visibility', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'it-archived',
        slug: 'it-archived',
        title: 'VPN arhiva',
        status: 'ARCHIVED',
        archivedAt: at(1),
        updatedAt: at(0),
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'it-published',
        slug: 'it-published',
        title: 'VPN pristup',
        updatedAt: at(10),
      }),
    );

    // The super admin may see archived rows in the list, but search is a
    // discovery surface: `status != ARCHIVED` is pushed down for every actor.
    const found = await articles.searchTitles(
      { q: 'VPN', limit: 8 },
      { actorUserId: superAdmin },
    );

    expect(found.items.map((item) => item.id)).toEqual(['it-published']);
    expect(found.incomplete).toBe(false);
  });

  it('walks rows with an identical timestamp by id without skipping or repeating', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    // 60 rows share `updatedAt`: only `id asc` breaks the tie. A keyset that
    // ignored the tiebreaker would loop or drop rows at the batch boundary.
    for (let index = 0; index < 60; index += 1) {
      memory.seedArticle(
        publishedArticleSeed({
          id: `same-${pad(index)}`,
          slug: `same-${pad(index)}`,
          title: 'VPN pristup',
          updatedAt: at(0),
        }),
      );
    }

    const whole = await articles.searchTitles(
      { q: 'VPN', limit: 100 },
      { actorUserId: superAdmin },
    );
    expect(whole.items.map((item) => item.id)).toEqual(
      Array.from({ length: 60 }, (_unused, index) => `same-${pad(index)}`),
    );
    expect(whole.incomplete).toBe(false);

    // Cutting inside the tie group still reports the remainder.
    const cut = await articles.searchTitles(
      { q: 'VPN', limit: 55 },
      { actorUserId: superAdmin },
    );
    expect(cut.items).toHaveLength(55);
    expect(cut.incomplete).toBe(true);
  });

  it('compares the needle case-insensitively and never reads without an actor', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'it-upper',
        slug: 'it-upper',
        title: 'VPN PRISTUP',
        updatedAt: at(1),
      }),
    );

    const found = await articles.searchTitles(
      { q: 'vpn pristup', limit: 8 },
      { actorUserId: agentIt },
    );
    expect(found.items.map((item) => item.id)).toEqual(['it-upper']);

    // Same fail-closed answer as the list: FORBIDDEN, not an empty group.
    await expect(
      articles.searchTitles({ q: 'vpn', limit: 8 }, { actorUserId: 'user-unknown' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('keeps a confidential article of another unit out of the IT answer', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'hr-only',
        slug: 'hr-only',
        title: 'VPN pristup',
        classification: 'CONFIDENTIAL',
        organizationalUnitId: ouHr,
        updatedAt: at(1),
      }),
    );

    const asIt = await articles.searchTitles(
      { q: 'VPN', limit: 8 },
      { actorUserId: agentIt },
    );
    expect(asIt.items).toEqual([]);
    // An empty answer that scanned everything is complete, and says so.
    expect(asIt.incomplete).toBe(false);

    // The agent of that unit reads it — the row is not globally hidden.
    const asHr = await articles.searchTitles(
      { q: 'VPN', limit: 8 },
      { actorUserId: knowledgeBaseTestIds.agentHr },
    );
    expect(asHr.items.map((item) => item.id)).toEqual(['hr-only']);
  });

  it('keeps the article scope of the list for a requester', async () => {
    const { articles, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'visible-internal',
        slug: 'visible-internal',
        title: 'VPN pristup',
        updatedAt: at(1),
      }),
    );
    memory.seedArticle(
      publishedArticleSeed({
        id: 'confidential',
        slug: 'confidential',
        title: 'VPN pristup za upravu',
        classification: 'CONFIDENTIAL',
        updatedAt: at(2),
      }),
    );
    // The search answers exactly what the list answers — same visibility rule,
    // one implementation.
    const listed = await articles.list(
      { q: 'VPN', limit: 50 },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    const found = await articles.searchTitles(
      { q: 'VPN', limit: 8 },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(found.items.map((item) => item.id).sort()).toEqual(
      listed.items.map((row) => row.id).sort(),
    );
    expect(found.items.map((item) => item.id)).toEqual(['visible-internal']);
    expect(found.items[0]).toMatchObject({
      slug: 'visible-internal',
      title: 'VPN pristup',
    });
  });
});
