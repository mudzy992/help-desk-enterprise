import { permissionKeys } from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
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
  readonly inactiveUsers?: readonly string[];
  readonly memberships?: number;
}) {
  const created: Array<{ readonly userId: string; readonly dedupeKey: string }> = [];
  const dedupeKeys = new Set<string>();
  const calls = { membershipQueries: 0, batches: 0 };
  const prisma = {
    knowledgeArticle: {
      findMany: async (query: {
        readonly where: { readonly status: string; readonly reviewDueAt: { readonly lte: Date } };
        readonly take?: number;
        readonly cursor?: { readonly id: string };
        readonly skip?: number;
      }) => {
        calls.batches += 1;
        const due = input.articles
          .filter(
            (row) =>
              row.status === query.where.status &&
              row.reviewDueAt !== null &&
              row.reviewDueAt.getTime() <= query.where.reviewDueAt.lte.getTime(),
          )
          // The service asks for `reviewDueAt asc, id asc`; the double must page the same order.
          .sort(
            (left, right) =>
              (left.reviewDueAt as Date).getTime() - (right.reviewDueAt as Date).getTime() ||
              left.id.localeCompare(right.id),
          );
        const start =
          query.cursor === undefined
            ? 0
            : due.findIndex((row) => row.id === query.cursor?.id) + (query.skip ?? 0);
        const window = due.slice(Math.max(start, 0));
        return query.take === undefined ? window : window.slice(0, query.take);
      },
    },
    groupMember: {
      findMany: async (query: { readonly where: { readonly groupId: string } }) => {
        calls.membershipQueries += 1;
        return (input.members?.[query.where.groupId] ?? []).map((userId) => ({ userId }));
      },
    },
    // W7.85: a recipient must still have an account, and the article scope must resolve.
    user: {
      findUnique: async (query: { readonly where: { readonly id: string } }) => ({
        isActive: !(input.inactiveUsers ?? []).includes(query.where.id),
      }),
    },
    organizationalUnit: {
      findUnique: async () => ({ ouPath: '/it' }),
    },
    service: {
      findUnique: async (query: { readonly where: { readonly id: string } }) => ({
        id: query.where.id,
      }),
    },
    userNotificationPreference: { findMany: async () => [] },
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
  return { created, dedupeKeys, calls, prisma };
}

/** An active agent who may write knowledge articles in the article's OU and service. */
function reminderLoader(): AuthorizationContextLoader {
  return {
    loadBySubjectId: async (subjectId: string) =>
      createTestAuthorizationContext({
        subjectId,
        assignments: [
          createTestAssignment({
            permissionKeys: [permissionKeys.knowledgeArticleWrite],
            organizationalUnitId: 'ou-1',
            organizationalUnitPath: '/it',
            serviceId: 'service-1',
          }),
        ],
      }),
  } as unknown as AuthorizationContextLoader;
}

function createService(
  prisma: unknown,
  configuration: { reviewCycleEnabled: boolean; remindDaysBefore: number },
) {
  const loader = { load: async () => configuration } as unknown as KnowledgeBaseConfigurationLoader;
  const settings = { getSetting: async () => undefined };
  return new KnowledgeBaseReviewReminderService(
    prisma as never,
    loader,
    reminderLoader(),
    settings as never,
  );
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

  it('w7.85: ne podsjeća deaktiviran račun i račun bez trenutne dozvole', async () => {
    const inactive = createStore({
      articles: [articleRow({ ownerUserId: 'user-gone' })],
      inactiveUsers: ['user-gone'],
    });
    await expect(
      createService(inactive.prisma, { reviewCycleEnabled: true, remindDaysBefore: 14 }).processDue(now),
    ).resolves.toBe(0);
    expect(inactive.created).toHaveLength(0);

    // Aktivan račun kome je dozvola ukinuta (npr. premješten u drugu OU) više ne dobija podsjetnik.
    const store = createStore({ articles: [articleRow()] });
    const withoutPermission = new KnowledgeBaseReviewReminderService(
      store.prisma as never,
      { load: async () => ({ reviewCycleEnabled: true, remindDaysBefore: 14 }) } as never,
      {
        loadBySubjectId: async (subjectId: string) =>
          createTestAuthorizationContext({ subjectId, assignments: [] }),
      } as unknown as AuthorizationContextLoader,
      { getSetting: async () => undefined } as never,
    );
    await expect(withoutPermission.processDue(now)).resolves.toBe(0);
    expect(store.created).toHaveLength(0);
  });

  it('w7.85: prelazi backlog u ograničenim serijama umjesto da učita sve odjednom', async () => {
    const total = 250;
    const articles = Array.from({ length: total }, (_, index) =>
      articleRow({ id: `article-${String(index).padStart(3, '0')}` }),
    );
    const store = createStore({ articles });
    const service = createService(store.prisma, {
      reviewCycleEnabled: true,
      remindDaysBefore: 14,
    });

    await expect(service.processDue(now)).resolves.toBe(total);

    // 100 + 100 + 50: tri upita, a ne jedan koji nosi cijeli backlog.
    expect(store.calls.batches).toBe(3);
    expect(store.created).toHaveLength(total);
  });

  it('w7.85: jedna membership provjera za sve članke iste owner grupe', async () => {
    const articles = Array.from({ length: 3 }, (_, index) =>
      articleRow({ id: `grouped-${index}`, ownerUserId: null, ownerGroupId: 'group-1' }),
    );
    const store = createStore({ articles, members: { 'group-1': ['user-a', 'user-b'] } });
    const service = createService(store.prisma, {
      reviewCycleEnabled: true,
      remindDaysBefore: 14,
    });

    await expect(service.processDue(now)).resolves.toBe(6);
    // Prije je svaki članak radio svoj membership upit; sada jedan po grupi po prolazu.
    expect(store.calls.membershipQueries).toBe(1);
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
