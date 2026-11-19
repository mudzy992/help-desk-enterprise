import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import {
  decodeKnowledgeArticleCursor,
  encodeKnowledgeArticleCursor,
} from './knowledge-article-cursor';
import { knowledgeBaseConstants } from './knowledge-base.constants';
import { publishedArticleSeed } from './published-article-seed';
import { vpnArticleInput } from './vpn-article-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const superAdmin = { actorUserId: knowledgeBaseTestIds.superAdmin };

function seedPublished(
  harness: ReturnType<typeof createKnowledgeBaseServiceHarness>,
  count: number,
  options: { readonly baseTime?: number; readonly stale?: (index: number) => boolean } = {},
): void {
  const base = options.baseTime ?? Date.parse('2026-09-11T12:00:00.000Z');
  for (let index = 0; index < count; index += 1) {
    const timestamp = new Date(base + index * 1000);
    const stale = options.stale?.(index) ?? false;
    harness.memory.seedArticle(
      publishedArticleSeed({
        id: `seed-${String(index).padStart(3, '0')}`,
        slug: `seed-${String(index).padStart(3, '0')}`,
        title: `Uputa ${index}`,
        updatedAt: timestamp,
        isStale: stale,
        // Freshness is recomputed from the dates, so staleness is seeded there.
        lastReviewedAt: stale ? new Date('2020-01-01T00:00:00.000Z') : timestamp,
      }),
    );
  }
}

describe('knowledge article list pagination (BA-knowledge-base-04)', () => {
  it('walks the corpus page by page without gaps or duplicates', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    for (let index = 0; index < 5; index += 1) {
      await harness.articles.create(vpnArticleInput({ title: `Uputa ${index}` }), {
        actorUserId: knowledgeBaseTestIds.agentIt,
      });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await harness.articles.list({ limit: 2, cursor }, superAdmin);
      pages += 1;
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => item.id));
      if (!page.hasMore) {
        expect(page.nextCursor).toBeNull();
        break;
      }
      expect(page.nextCursor).not.toBeNull();
      cursor = page.nextCursor ?? undefined;
      expect(pages).toBeLessThan(10);
    }
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
    expect(seen).toHaveLength(5);
  });

  it('clamps the page size to the allowed window', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    seedPublished(harness, 3);
    const oversized = await harness.articles.list({ limit: 5000 }, superAdmin);
    expect(oversized.items).toHaveLength(3);
    expect(oversized.hasMore).toBe(false);
    const tooSmall = await harness.articles.list({ limit: 0 }, superAdmin);
    expect(tooSmall.items).toHaveLength(1);
    expect(tooSmall.hasMore).toBe(true);
  });

  it('never reads more than the scan budget per request', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    seedPublished(harness, 300);
    const findMany = jest.spyOn(harness.memory.prisma.knowledgeArticle, 'findMany');

    const page = await harness.articles.list({ limit: 100 }, superAdmin);

    expect(page.items).toHaveLength(100);
    expect(page.hasMore).toBe(true);
    expect(findMany.mock.calls.length).toBeLessThanOrEqual(
      knowledgeBaseConstants.maximumListScanBatches,
    );
    for (const call of findMany.mock.calls) {
      const take = (call[0] as { take?: number } | undefined)?.take;
      expect(take).toBeDefined();
      expect(take ?? 0).toBeLessThanOrEqual(
        knowledgeBaseConstants.listScanBatchSize + 1,
      );
    }
  });

  it('keeps a filtered page full by filtering inside the scan', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    // 60 fresh rows fill more than one batch; the single stale row sits behind
    // them, so a post-page filter would have returned an empty first page.
    seedPublished(harness, 60, { stale: () => false });
    harness.memory.seedArticle(
      publishedArticleSeed({
        id: 'stale-old',
        slug: 'stale-old',
        title: 'Zastarjela uputa',
        updatedAt: new Date('2020-01-01T00:00:00.000Z'),
        isStale: true,
        lastReviewedAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    );

    const page = await harness.articles.list({ limit: 1, staleOnly: true }, superAdmin);

    expect(page.items.map((item) => item.id)).toEqual(['stale-old']);
    expect(page.hasMore).toBe(false);
  });

  it('rejects a malformed cursor and refuses search pages past the cap', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    seedPublished(harness, 2);
    await expect(
      harness.articles.list({ cursor: 'not-a-cursor' }, superAdmin),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CURSOR' } });
    expect(() =>
      decodeKnowledgeArticleCursor(
        encodeKnowledgeArticleCursor({ kind: 'offset', offset: 5000 }),
      ),
    ).toThrow('INVALID_CURSOR');
  });

  it('round-trips a keyset cursor', () => {
    const updatedAt = new Date('2026-09-11T12:00:00.000Z');
    const decoded = decodeKnowledgeArticleCursor(
      encodeKnowledgeArticleCursor({ kind: 'keyset', updatedAt, id: 'kb-7' }),
    );
    expect(decoded).toEqual({ kind: 'keyset', updatedAt, id: 'kb-7' });
    expect(decodeKnowledgeArticleCursor(undefined)).toBeNull();
  });
});
