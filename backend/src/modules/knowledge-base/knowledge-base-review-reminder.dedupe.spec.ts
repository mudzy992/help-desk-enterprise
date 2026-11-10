import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import { KnowledgeBaseReviewReminderService } from './knowledge-base-review-reminder.service';
import { toArticleRecord } from './load-knowledge-article';

// Same shim every service-level spec in this repo uses: the real Prisma client is
// not resolvable offline, and this spec drives a hand-written store anyway.
jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Phase 4.1 (plan §4.1): before the sweep moved into the worker, its idempotency had
 * to be proven — a scheduled job can be retried (attempts + backoff) or run by two
 * workers if a lock is ever lost, and a duplicated reminder is a user-visible bug.
 *
 * The proof is the dedupe key the service already writes per recipient: the database
 * rejects the second row (`P2002`) and the sweep counts only rows it really created.
 * This spec replays the two runs against a store that enforces that uniqueness.
 */
type ArticleRow = Parameters<typeof toArticleRecord>[0];

function articleRow(overrides: Partial<ArticleRow> = {}): ArticleRow {
  return {
    id: 'article-1',
    slug: 'vpn-setup',
    title: 'VPN setup',
    body: 'Steps',
    status: 'PUBLISHED',
    classification: 'INTERNAL',
    isStale: false,
    reviewDueAt: new Date('2026-10-01T00:00:00.000Z'),
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastReviewedAt: null,
    archivedAt: null,
    ownerUserId: 'user-owner',
    ownerGroupId: null,
    reviewerUserId: null,
    serviceId: 'service-1',
    organizationalUnitId: 'ou-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createStore(input: {
  readonly articles: readonly ArticleRow[];
  readonly members?: Readonly<Record<string, readonly string[]>>;
}) {
  const created: Array<{ readonly userId: string; readonly dedupeKey: string }> = [];
  const dedupeKeys = new Set<string>();
  const prisma = {
    knowledgeArticle: {
      findMany: async (query: {
        readonly where: { readonly status: string; readonly reviewDueAt: { readonly lte: Date } };
      }) =>
        input.articles.filter(
          (row) =>
            row.status === query.where.status &&
            row.reviewDueAt !== null &&
            row.reviewDueAt.getTime() <= query.where.reviewDueAt.lte.getTime(),
        ),
    },
    groupMember: {
      findMany: async (query: { readonly where: { readonly groupId: string } }) =>
        (input.members?.[query.where.groupId] ?? []).map((userId) => ({ userId })),
    },
    notification: {
      create: async (query: { readonly data: { readonly userId: string; readonly dedupeKey: string } }) => {
        if (dedupeKeys.has(query.data.dedupeKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        dedupeKeys.add(query.data.dedupeKey);
        created.push({ userId: query.data.userId, dedupeKey: query.data.dedupeKey });
        return { id: `notification-${created.length}`, ...query.data };
      },
    },
  };
  return { created, dedupeKeys, prisma };
}

function createService(
  prisma: unknown,
  configuration: { reviewCycleEnabled: boolean; remindDaysBefore: number },
) {
  const loader = { load: async () => configuration } as unknown as KnowledgeBaseConfigurationLoader;
  return new KnowledgeBaseReviewReminderService(prisma as never, loader);
}

const now = new Date('2026-09-24T09:00:00.000Z');

describe('KnowledgeBaseReviewReminderService idempotency', () => {
  it('sends one reminder per owner and none on the second sweep', async () => {
    const store = createStore({ articles: [articleRow()] });
    const service = createService(store.prisma, {
      reviewCycleEnabled: true,
      remindDaysBefore: 14,
    });

    await expect(service.processDue(now)).resolves.toBe(1);
    expect(store.created).toEqual([
      {
        userId: 'user-owner',
        dedupeKey: 'kb-review:article-1:2026-10-01T00:00:00.000Z:user-owner',
      },
    ]);

    // The scheduled job retried (or a second worker grabbed the same occurrence).
    await expect(service.processDue(now)).resolves.toBe(0);
    expect(store.created).toHaveLength(1);
  });

  it('reminds every member of the owning group exactly once', async () => {
    const store = createStore({
      articles: [articleRow({ ownerUserId: null, ownerGroupId: 'group-1' })],
      members: { 'group-1': ['user-a', 'user-b'] },
    });
    const service = createService(store.prisma, {
      reviewCycleEnabled: true,
      remindDaysBefore: 14,
    });

    await expect(service.processDue(now)).resolves.toBe(2);
    await expect(service.processDue(now)).resolves.toBe(0);
    expect(store.created.map((item) => item.userId).sort()).toEqual([
      'user-a',
      'user-b',
    ]);
  });

  it('remembers the review period, so the next cycle does remind again', async () => {
    const row = articleRow();
    const store = createStore({ articles: [row] });
    const service = createService(store.prisma, {
      reviewCycleEnabled: true,
      remindDaysBefore: 14,
    });
    await service.processDue(now);

    // The article was reviewed and is due again next year: a new period, new key.
    store.prisma.knowledgeArticle.findMany = async () => [
      { ...row, reviewDueAt: new Date('2027-10-01T00:00:00.000Z') },
    ];
    await expect(service.processDue(now)).resolves.toBe(1);
    expect(store.created).toHaveLength(2);
    expect(store.created[1]?.dedupeKey).toContain('2027-10-01T00:00:00.000Z');
  });

  it('does nothing while the review cycle is disabled or nothing is due yet', async () => {
    const store = createStore({ articles: [articleRow()] });
    const disabled = createService(store.prisma, {
      reviewCycleEnabled: false,
      remindDaysBefore: 14,
    });
    await expect(disabled.processDue(now)).resolves.toBe(0);

    const enabled = createService(store.prisma, {
      reviewCycleEnabled: true,
      remindDaysBefore: 14,
    });
    // reviewDueAt is 2026-10-01, the window ends 2026-10-08 — inside; move the clock
    // back so the same article is still outside the reminder window.
    await expect(
      enabled.processDue(new Date('2026-08-01T09:00:00.000Z')),
    ).resolves.toBe(0);
    expect(store.created).toHaveLength(0);
  });
});
