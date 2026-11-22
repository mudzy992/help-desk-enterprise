import { createKnowledgeBaseServiceHarness, knowledgeBaseTestIds } from '../create-knowledge-base-service-harness';
import { knowledgeBaseConstants } from '../knowledge-base.constants';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { publishedArticleSeed } from '../published-article-seed';
import { knowledgeRatingBonus } from '../rank-knowledge-articles';
import {
  flushKnowledgeArticleViews,
  inspectKnowledgeViewBacklog,
  knowledgeViewKeys,
  recordKnowledgeArticleView,
} from './knowledge-article-views';
import { KnowledgePortalService } from './knowledge-portal.service';

type Category = {
  id: string;
  key: string;
  nameBs: string;
  nameEn: string;
  icon: string;
  sortOrder: number;
  parentId: string | null;
  isArchived: boolean;
};

/** Minimal Redis double: the commands the view counter uses. */
function createFakeRedis() {
  const strings = new Map<string, number>();
  const sets = new Map<string, Set<string>>();
  const set = (key: string) => sets.get(key) ?? sets.set(key, new Set()).get(key)!;
  const client = {
    failing: false,
    multi() {
      const ops: (() => unknown)[] = [];
      const chain = {
        pfadd: (key: string, member: string) => (ops.push(() => set(`hll:${key}`).add(member)), chain),
        incr: (key: string) => (ops.push(() => strings.set(key, (strings.get(key) ?? 0) + 1)), chain),
        sadd: (key: string, member: string) => (ops.push(() => set(key).add(member)), chain),
        expire: () => (ops.push(() => 1), chain),
        exec: async () => {
          if (client.failing) throw new Error('NOPERM');
          return ops.map((op) => [null, op()]);
        },
      };
      return chain;
    },
    smembers: async (key: string) => [...(sets.get(key) ?? [])],
    get: async (key: string) => (strings.has(key) ? String(strings.get(key)) : null),
    pfcount: async (key: string) => sets.get(`hll:${key}`)?.size ?? 0,
    del: async (...keys: string[]) => {
      for (const key of keys) {
        strings.delete(key);
        sets.delete(key);
        sets.delete(`hll:${key}`);
      }
      return keys.length;
    },
    srem: async (key: string, member: string) => (sets.get(key)?.delete(member) ? 1 : 0),
    sets,
    strings,
  };
  return client;
}

function createPortalHarness(settings: Record<string, unknown> = {}) {
  const harness = createKnowledgeBaseServiceHarness();
  const categories = new Map<string, Category>();
  const views = new Map<string, { articleId: string; day: Date; views: number; uniqueViewers: number }>();
  const audits: unknown[] = [];
  let sequence = 0;
  const prisma = harness.memory.prisma as unknown as Record<string, unknown>;
  /**
   * W7.90 (`BA-knowledge-base-17`): the tree is queried with keyset filters now (`parentId: { in: [...] }`,
   * `OR` branches, `take`, `select`), so the fake has to read the same shapes the real delegate reads. A fake
   * that only understands `===` would let a broken pagination pass.
   */
  const matchCategoryCondition = (value: unknown, condition: unknown): boolean => {
    if (condition !== null && typeof condition === 'object') {
      const typed = condition as { in?: readonly unknown[]; gt?: unknown; lt?: unknown };
      if (Array.isArray(typed.in)) return typed.in.includes(value);
      if ('gt' in typed) return typeof value === 'number' && value > (typed.gt as number);
      if ('lt' in typed) return typeof value === 'number' && value < (typed.lt as number);
      return false;
    }
    return value === condition;
  };
  const matchCategory = (row: Category, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, condition]) => {
      if (key === 'OR') {
        return (condition as Record<string, unknown>[]).some((branch) => matchCategory(row, branch));
      }
      return matchCategoryCondition((row as Record<string, unknown>)[key], condition);
    });
  const orderCategories = (
    rows: Category[],
    orderBy?: readonly Record<string, 'asc' | 'desc'>[],
  ): Category[] =>
    [...rows].sort((left, right) => {
      for (const clause of orderBy ?? []) {
        for (const [key, direction] of Object.entries(clause)) {
          const first = (left as Record<string, unknown>)[key] as string | number;
          const second = (right as Record<string, unknown>)[key] as string | number;
          if (first === second) continue;
          return (first < second ? -1 : 1) * (direction === 'asc' ? 1 : -1);
        }
      }
      return 0;
    });
  const pickCategoryFields = (row: Category, select?: Record<string, boolean>) =>
    select === undefined ? row : Object.fromEntries(Object.keys(select).map((key) => [key, (row as Record<string, unknown>)[key]]));
  prisma.knowledgeCategory = {
    findMany: async ({
      where,
      orderBy,
      take,
      select,
    }: {
      where?: Record<string, unknown>;
      orderBy?: readonly Record<string, 'asc' | 'desc'>[];
      take?: number;
      select?: Record<string, boolean>;
    } = {}) => {
      const rows = orderCategories(
        [...categories.values()].filter((row) => matchCategory(row, where)),
        orderBy,
      );
      const page = take === undefined ? rows : rows.slice(0, take);
      return page.map((row) => pickCategoryFields(row, select));
    },
    findUnique: async ({
      where,
      select,
    }: {
      where: { id?: string; key?: string };
      select?: Record<string, boolean>;
    }) => {
      const row =
        [...categories.values()].find((item) => (where.id ? item.id === where.id : item.key === where.key)) ??
        null;
      return row === null ? null : pickCategoryFields(row, select);
    },
    count: async ({ where }: { where?: Record<string, unknown> }) =>
      [...categories.values()].filter((row) => matchCategory(row, where)).length,
    create: async ({ data }: { data: Omit<Category, 'id' | 'isArchived'> }) => {
      const row = { id: `cat-${++sequence}`, isArchived: false, ...data };
      categories.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Category> }) => {
      const row = { ...categories.get(where.id)!, ...data };
      categories.set(row.id, row);
      return row;
    },
  };
  // Paket 5.2.4 (M14 B7): archive guard counts active articles in the category.
  // The in-memory article delegate already provides count(), but this spec
  // builds its own prisma surface and the real harness may be shared across
  // tests — install a minimal count stub so the category-only assertion does
  // not depend on the full delegate shape.
  const existingArticleDelegate = prisma.knowledgeArticle as
    | Record<string, unknown>
    | undefined;
  prisma.knowledgeArticle = {
    ...(existingArticleDelegate ?? {}),
    count: async ({ where }: { where?: { categoryId?: string; archivedAt?: null } } = {}) => {
      if (existingArticleDelegate && typeof existingArticleDelegate.count === 'function') {
        return existingArticleDelegate.count({ where });
      }
      return 0;
    },
  };
  const viewKey = (where: { articleId: string; day: Date }) =>
    `${where.articleId}:${where.day.toISOString()}`;
  prisma.knowledgeArticleView = {
    // W7.89: the flush reads the day before it writes it, to move the article total
    // by the delta only; the Redis-less path increments.
    findUnique: async ({ where }: { where: { articleId_day: { articleId: string; day: Date } } }) =>
      views.get(viewKey(where.articleId_day)) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { articleId_day: { articleId: string; day: Date } };
      create: { articleId: string; day: Date; views: number; uniqueViewers: number };
      update: { views: number | { increment: number }; uniqueViewers?: number };
    }) => {
      const key = viewKey(where.articleId_day);
      const current = views.get(key);
      if (current === undefined) {
        views.set(key, { ...create });
        return;
      }
      const nextViews = typeof update.views === 'number' ? update.views : current.views + update.views.increment;
      const nextUniqueViewers =
          typeof update.views === 'number' ? (update.uniqueViewers ?? current.uniqueViewers) : current.uniqueViewers;
      views.set(key, { ...current, views: nextViews, uniqueViewers: nextUniqueViewers });
    },
    groupBy: async () =>
      [...views.values()].reduce<{ articleId: string; _sum: { views: number } }[]>((rows, row) => {
        const existing = rows.find((item) => item.articleId === row.articleId);
        if (existing) existing._sum.views += row.views;
        else rows.push({ articleId: row.articleId, _sum: { views: row.views } });
        return rows;
      }, []),
  };
  prisma.$executeRaw = async () => 0;
  // W7.84: the category membership lock is taken with `$queryRaw` (set_config + pg_advisory_xact_lock).
  prisma.$queryRaw = async () => [{ acquired: 1 }];
  prisma.auditLog = {
    findFirst: async () => null,
    create: async ({ data }: { data: unknown }) => audits.push(data),
  };
  const redis = createFakeRedis();
  const service = new KnowledgePortalService(
    harness.memory.prisma as never,
    { loadBySubjectId: async (id: string) => harness.contexts.get(id) ?? null } as never,
    { load: async () => ({ ...harness.configuration }) } as never,
    { getSetting: async (key: string) => settings[key] } as never,
    { getClient: () => redis } as never,
  );
  return { ...harness, service, categories, views, audits, redis };
}

const asUser = (actorUserId: string) => ({ actorUserId });
const superAdmin = asUser(knowledgeBaseTestIds.superAdmin);

describe('KnowledgePortalService (Paket 2.9, K1)', () => {
  it('lets only category managers create categories and keeps one level', async () => {
    const { service, audits } = createPortalHarness();
    await expect(
      service.createCategory({ key: 'vpn', nameBs: 'VPN', nameEn: 'VPN' }, asUser(knowledgeBaseTestIds.requester)),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    const root = await service.createCategory({ key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi' }, superAdmin);
    const child = await service.createCategory(
      { key: 'vpn', nameBs: 'VPN', nameEn: 'VPN', parentId: root.id },
      superAdmin,
    );
    await expect(
      service.createCategory({ key: 'deep', nameBs: 'Dublje', nameEn: 'Deeper', parentId: child.id }, superAdmin),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CATEGORY' } });
    await expect(
      service.createCategory({ key: 'vpn', nameBs: 'Opet', nameEn: 'Again' }, superAdmin),
    ).rejects.toMatchObject({ response: { code: 'CATEGORY_KEY_TAKEN' } });
    await expect(service.setCategoryArchived(root.id, true, superAdmin)).rejects.toMatchObject({
      response: { code: 'CATEGORY_NOT_EMPTY' },
    });
    await service.setCategoryArchived(child.id, true, superAdmin);
    await service.setCategoryArchived(root.id, true, superAdmin);
    expect(audits).toHaveLength(4);
  });

  // Paket 5.2.4 (M14 B7): archiving a category that still has active (non-archived)
  // articles must be rejected, even if there are no child categories. Once articles
  // are archived (categoryId=null move, or article archivedAt set), the archive
  // succeeds.
  it('rejects archiving a category that still has published articles (M14 B7)', async () => {
    const { service, memory, categories } = createPortalHarness();
    categories.set('root', { id: 'root', key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: false });
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1', title: 'Active', categoryId: 'root' }));
    await expect(service.setCategoryArchived('root', true, superAdmin)).rejects.toMatchObject({
      response: { code: 'CATEGORY_NOT_EMPTY' },
    });
    // Archived articles should not block archival.
    memory.seedArticle(
      publishedArticleSeed({
        id: 'a2',
        slug: 'a2',
        title: 'Archived',
        categoryId: 'root',
        archivedAt: new Date('2026-09-01'),
      }),
    );
    // Move the active one out by updating; after that archive succeeds.
    await service.placeArticle('a1', { categoryId: null, reason: 'move' }, superAdmin);
    const archived = await service.setCategoryArchived('root', true, superAdmin);
    expect(archived.isArchived).toBe(true);
  });

  it('builds the home page: counts include subcategories, FAQ is ordered and capped', async () => {
    const { service, memory, categories } = createPortalHarness({
      'private.knowledgeBase.portal.faqMaxItems': 2,
    });
    categories.set('root', { id: 'root', key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: false });
    categories.set('child', { id: 'child', key: 'vpn', nameBs: 'VPN', nameEn: 'VPN', icon: 'shield', sortOrder: 1, parentId: 'root', isArchived: false });
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1', title: 'Alpha', categoryId: 'root', isFaq: true, faqOrder: 2 }));
    memory.seedArticle(publishedArticleSeed({ id: 'a2', slug: 'a2', title: 'Beta', categoryId: 'child', isFaq: true, faqOrder: 1 }));
    memory.seedArticle(publishedArticleSeed({ id: 'a3', slug: 'a3', title: 'Gamma', isFaq: true, viewCount: 99 }));
    memory.seedArticle(publishedArticleSeed({ id: 'a4', slug: 'a4', title: 'Draft', status: 'DRAFT', categoryId: 'root' }));
    const home = await service.home(asUser(knowledgeBaseTestIds.requester));
    expect(home.categories.find((item) => item.id === 'root')?.articleCount).toBe(2);
    expect(home.categories.find((item) => item.id === 'child')?.articleCount).toBe(1);
    expect(home.uncategorizedCount).toBe(1);
    expect(home.faq.map((item) => item.id)).toEqual(['a2', 'a1']);
    expect(home.categoriesComplete).toBe(true);
    expect(home.capabilities).toEqual({ canManageCategories: false, canCurate: false, canDraftFromReply: false });
    const inRoot = await service.categoryArticles('root', asUser(knowledgeBaseTestIds.requester));
    // W7.52: the category page keeps the shared list order (updatedAt desc, id asc).
    expect(inRoot.items.map((item) => item.id)).toEqual(['a1', 'a2']);
    expect(inRoot.hasMore).toBe(false);
    const loose = await service.categoryArticles('uncategorized', asUser(knowledgeBaseTestIds.requester));
    expect(loose.items.map((item) => item.id)).toEqual(['a3']);
  });

  it('pages a category instead of loading the whole published corpus', async () => {
    const { service, memory, categories } = createPortalHarness();
    categories.set('root', {
      id: 'root',
      key: 'mreza',
      nameBs: 'Mreža',
      nameEn: 'Network',
      icon: 'wifi',
      sortOrder: 0,
      parentId: null,
      isArchived: false,
    });
    for (let index = 0; index < 3; index += 1) {
      const id = `p${index}`;
      memory.seedArticle(
        publishedArticleSeed({
          id,
          slug: id,
          title: `Uputa ${index}`,
          categoryId: 'root',
          updatedAt: new Date(Date.parse('2026-09-11T12:00:00.000Z') + index * 1000),
        }),
      );
    }

    const first = await service.categoryArticles('root', asUser(knowledgeBaseTestIds.requester), {
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.categoryArticles(
      'root',
      asUser(knowledgeBaseTestIds.requester),
      { limit: 2, cursor: first.nextCursor ?? undefined },
    );
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    const seen = new Set([...first.items, ...second.items].map((item) => item.id));
    expect(seen.size).toBe(3);
  });

  it('flags the home counts as incomplete when the corpus exceeds the cap', async () => {
    const { service, memory } = createPortalHarness();
    const timestamp = Date.parse('2026-09-11T12:00:00.000Z');
    for (let index = 0; index < knowledgeBaseConstants.portalHomeScanCap + 1; index += 1) {
      const id = `cap-${index}`;
      memory.seedArticle(
        publishedArticleSeed({
          id,
          slug: id,
          title: `Uputa ${index}`,
          updatedAt: new Date(timestamp + index * 1000),
        }),
      );
    }

    const home = await service.home(asUser(knowledgeBaseTestIds.requester));
    expect(home.articleCountsComplete).toBe(false);
    expect(home.uncategorizedCount).toBeLessThanOrEqual(
      knowledgeBaseConstants.portalHomeScanCap,
    );
  });

  it('places articles for writers only and records the change', async () => {
    const { service, memory, categories } = createPortalHarness();
    categories.set('root', { id: 'root', key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: false });
    categories.set('old', { id: 'old', key: 'staro', nameBs: 'Staro', nameEn: 'Old', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: true });
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    await expect(
      service.placeArticle('a1', { categoryId: 'root', reason: 'x' }, asUser(knowledgeBaseTestIds.requester)),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    await expect(
      service.placeArticle('a1', { categoryId: 'old', reason: 'x' }, asUser(knowledgeBaseTestIds.agentIt)),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CATEGORY' } });
    const placed = await service.placeArticle(
      'a1',
      { categoryId: 'root', isFaq: true, faqOrder: 3, reason: 'Portal' },
      asUser(knowledgeBaseTestIds.agentIt),
    );
    expect(placed).toMatchObject({ categoryId: 'root', isFaq: true, faqOrder: 3, status: 'PUBLISHED' });
    expect(memory.changeLogs.length).toBeGreaterThan(0);
    const unfaq = await service.placeArticle('a1', { isFaq: false, reason: 'x' }, asUser(knowledgeBaseTestIds.agentIt));
    expect(unfaq.faqOrder).toBeNull();
  });

  it('w7.83: upisuje placement i change log u jednoj transakciji', async () => {
    const { service, memory, categories } = createPortalHarness();
    categories.set('root', { id: 'root', key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: false });
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    const prisma = memory.prisma as unknown as Record<string, unknown>;
    const originalTransaction = prisma.$transaction as (callback: (client: unknown) => Promise<unknown>) => Promise<unknown>;
    let inTransaction = false;
    prisma.$transaction = async (callback: (client: unknown) => Promise<unknown>) => {
      inTransaction = true;
      try {
        return await originalTransaction(callback);
      } finally {
        inTransaction = false;
      }
    };
    const changeLog = prisma.changeLog as { create: (args: unknown) => Promise<unknown> };
    const originalCreate = changeLog.create;
    let changeLogInside = false;
    changeLog.create = async (args: unknown) => {
      changeLogInside = inTransaction;
      return originalCreate(args);
    };

    await service.placeArticle(
      'a1',
      { categoryId: 'root', isFaq: true, faqOrder: 2, reason: 'Portal' },
      asUser(knowledgeBaseTestIds.agentIt),
    );

    // Premještanje bez zapisa u change logu (ili zapis bez premještanja) više nije moguće.
    expect(changeLogInside).toBe(true);
    expect(memory.changeLogs).toHaveLength(1);
  });

  it('w7.83: odbija placement ako je članak izmijenjen između čitanja i upisa', async () => {
    const { service, memory, categories } = createPortalHarness();
    categories.set('root', { id: 'root', key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: false });
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    const prisma = memory.prisma as unknown as Record<string, unknown>;
    const articles = prisma.knowledgeArticle as { findUnique: unknown };
    const typedFindUnique = articles.findUnique as (
      args: { where?: { id?: string } },
    ) => Promise<unknown>;
    // Drugi pisac je commitovao poslije našeg čitanja: `updatedAt` koji smo vidjeli više nije na redu.
    articles.findUnique = (async (args: { where?: { id?: string } }) => {
      const row = (await typedFindUnique(args)) as { id?: string; updatedAt?: Date } | null;
      if (row === null || row.updatedAt === undefined) return row;
      return { ...row, updatedAt: new Date(row.updatedAt.getTime() - 1_000) };
    }) as unknown;

    await expect(
      service.placeArticle(
        'a1',
        { categoryId: 'root', reason: 'Portal' },
        asUser(knowledgeBaseTestIds.agentIt),
      ),
    ).rejects.toMatchObject({ response: { code: 'STALE_WRITE' } });
    articles.findUnique = typedFindUnique;
    expect(memory.changeLogs).toHaveLength(0);
    expect(memory.articles.get('a1')?.categoryId).toBeNull();
  });

  it('w7.83: kategorija i njen audit zapis se commit-uju zajedno', async () => {
    const { service, audits, categories } = createPortalHarness();
    const prisma = (service as unknown as { prisma: Record<string, unknown> }).prisma;
    const originalTransaction = prisma.$transaction as (callback: (client: unknown) => Promise<unknown>) => Promise<unknown>;
    let inTransaction = false;
    prisma.$transaction = async (callback: (client: unknown) => Promise<unknown>) => {
      inTransaction = true;
      try {
        return await originalTransaction(callback);
      } finally {
        inTransaction = false;
      }
    };
    const auditLog = prisma.auditLog as { create: (args: unknown) => Promise<unknown> };
    const originalCreate = auditLog.create;
    const inside: boolean[] = [];
    auditLog.create = async (args: unknown) => {
      inside.push(inTransaction);
      return originalCreate(args);
    };

    const created = await service.createCategory(
      { key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi' },
      superAdmin,
    );
    await service.updateCategory(created.id, { nameBs: 'Mreža i VPN' }, superAdmin);
    await service.setCategoryArchived(created.id, true, superAdmin);

    expect(categories.get(created.id)?.isArchived).toBe(true);
    expect(audits).toHaveLength(3);
    // Nijedan od tri audit zapisa ne smije ostati izvan transakcije koja nosi samu izmjenu.
    expect(inside).toEqual([true, true, true]);
  });

  it('w7.84: arhiviranje drži bravu kategorije prije nego što prebroji sadržaj', async () => {
    const { service, categories, memory } = createPortalHarness();
    categories.set('empty', { id: 'empty', key: 'prazna', nameBs: 'Prazna', nameEn: 'Empty', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: false });
    const prisma = memory.prisma as unknown as Record<string, unknown>;
    const queryRaw = jest.fn(async (..._args: unknown[]) => [{ acquired: 1 }]);
    prisma.$queryRaw = queryRaw;
    const articles = prisma.knowledgeArticle as { count: (...args: unknown[]) => Promise<unknown> };
    const originalCount = articles.count;
    const count = jest.fn(async (...args: unknown[]) => originalCount(...args));
    articles.count = count;

    await service.setCategoryArchived('empty', true, superAdmin);

    // Brava mora biti uzeta prije brojanja, inače count i upis ostaju dvije odluke.
    const identity = `${'knowledge-base.category-membership'.length}:knowledge-base.category-membership:empty`;
    expect(queryRaw.mock.calls.some((call) => call.includes(identity))).toBe(true);
    expect(count).toHaveBeenCalledTimes(1);
    const lockOrder = Math.max(...queryRaw.mock.invocationCallOrder);
    expect(lockOrder).toBeLessThan(count.mock.invocationCallOrder[0]!);
    expect(categories.get('empty')?.isArchived).toBe(true);
  });

  it('w7.84: placement drži istu bravu za kategoriju u koju članak ulazi', async () => {
    const { service, memory, categories } = createPortalHarness();
    categories.set('root', { id: 'root', key: 'mreza', nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi', sortOrder: 0, parentId: null, isArchived: false });
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    const prisma = memory.prisma as unknown as Record<string, unknown>;
    const queryRaw = jest.fn(async (..._args: unknown[]) => [{ acquired: 1 }]);
    prisma.$queryRaw = queryRaw;

    await service.placeArticle('a1', { categoryId: 'root', reason: 'Portal' }, asUser(knowledgeBaseTestIds.agentIt));

    const identity = `${'knowledge-base.category-membership'.length}:knowledge-base.category-membership:root`;
    expect(queryRaw.mock.calls.some((call) => call.includes(identity))).toBe(true);
    expect(memory.articles.get('a1')?.categoryId).toBe('root');
  });

  it('counts published views in Redis, flushes finished days and falls back to the database', async () => {
    const { service, memory, redis, views } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    memory.seedArticle(publishedArticleSeed({ id: 'a2', slug: 'a2', status: 'DRAFT' }));
    await service.recordView('a1', asUser(knowledgeBaseTestIds.requester));
    await service.recordView('a1', asUser(knowledgeBaseTestIds.requester));
    await service.recordView('a1', asUser(knowledgeBaseTestIds.agentIt));
    await service.recordView('a2', asUser(knowledgeBaseTestIds.agentIt));
    const today = new Date().toISOString().slice(0, 10);
    expect(redis.strings.get(knowledgeViewKeys.counter(today, 'a1'))).toBe(3);
    expect(redis.strings.has(knowledgeViewKeys.counter(today, 'a2'))).toBe(false);
    // Today is not finished: nothing to flush yet.
    expect(await flushKnowledgeArticleViews({ prisma: memory.prisma as never, redis: redis as never, now: new Date() })).toBe(0);
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect(await flushKnowledgeArticleViews({ prisma: memory.prisma as never, redis: redis as never, now: tomorrow })).toBe(1);
    expect([...views.values()][0]).toMatchObject({ articleId: 'a1', views: 3, uniqueViewers: 2 });
    expect(memory.articles.get('a1')?.viewCount).toBe(3);
    expect(redis.sets.get(knowledgeViewKeys.pendingDays)?.size ?? 0).toBe(0);

    redis.failing = true;
    await service.recordView('a1', asUser(knowledgeBaseTestIds.requester));
    expect(memory.articles.get('a1')?.viewCount).toBe(4);
    // W7.89: the Redis-less path counts the view but cannot deduplicate a viewer, so it
    // adds a view and claims no new one - the day row keeps the two viewers Redis saw
    // (the old code would have made it three, i.e. "every visit is a new person").
    const fallbackDay = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    expect(views.get(`a1:${fallbackDay}`)).toMatchObject({ views: 4, uniqueViewers: 2 });
  });

  it('reports how far behind the view flush is, and that it is caught up afterwards (W7.86)', async () => {
    const { memory, redis } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    await recordKnowledgeArticleView({
      prisma: memory.prisma as never,
      redis: redis as never,
      articleId: 'a1',
      userId: 'viewer-1',
      now: new Date('2026-11-18T10:00:00.000Z'),
    });

    // Three days later the finished day is still in Redis: the sweep did not run.
    const now = new Date('2026-11-21T00:30:00.000Z');
    expect(await inspectKnowledgeViewBacklog({ redis: redis as never, now })).toEqual({
      pendingFinishedDays: 1,
      oldestFinishedDay: '2026-11-18',
      lagDays: 3,
    });

    expect(
      await flushKnowledgeArticleViews({ prisma: memory.prisma as never, redis: redis as never, now }),
    ).toBe(1);
    expect(await inspectKnowledgeViewBacklog({ redis: redis as never, now })).toEqual({
      pendingFinishedDays: 0,
      oldestFinishedDay: null,
      lagDays: null,
    });
  });

  it('does not count the current day as a flush backlog', async () => {
    const { memory, redis } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    const now = new Date('2026-11-21T09:00:00.000Z');
    await recordKnowledgeArticleView({
      prisma: memory.prisma as never,
      redis: redis as never,
      articleId: 'a1',
      userId: 'viewer-1',
      now,
    });

    expect(await inspectKnowledgeViewBacklog({ redis: redis as never, now })).toEqual({
      pendingFinishedDays: 0,
      oldestFinishedDay: null,
      lagDays: null,
    });
  });

  it('pages the curator comment feed and never skips a row when one is resolved (W7.90)', async () => {
    const { service, memory } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    const base = Date.parse('2026-09-11T12:00:00.000Z');
    for (let index = 0; index < 3; index += 1) {
      const createdAt = new Date(base + index * 1000);
      memory.feedbacks.set(`f${index}`, {
        id: `f${index}`,
        articleId: 'a1',
        userId: `user-${index}`,
        isHelpful: false,
        rating: 2,
        comment: `Nedostaje korak ${index}`,
        commentResolvedAt: null,
        createdAt,
        updatedAt: createdAt,
      });
    }
    const curator = asUser(knowledgeBaseTestIds.agentIt);

    const first = await service.insightsComments(curator, { limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual(['f2', 'f1']);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    expect(first.items[0]).toMatchObject({ articleTitle: 'Reset VPN password', rating: 2 });

    // The curator resolves the newest comment between the two clicks: an offset would now skip f0.
    memory.feedbacks.set('f1', { ...memory.feedbacks.get('f1')!, commentResolvedAt: new Date() });
    const second = await service.insightsComments(curator, {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((item) => item.id)).toEqual(['f0']);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();

    // `insights` hands out the same feed, so the panel and "load more" agree on where they are — and the
    // resolved comment is already gone from it.
    const insights = await service.insights(curator);
    expect(insights.openComments.items.map((item) => item.id)).toEqual(['f2', 'f0']);
    expect(insights.openComments.hasMore).toBe(false);
  });

  it('says the comment feed was cut off instead of ending at fifty rows (W7.90)', async () => {
    const { service, memory } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    const base = Date.parse('2026-09-11T12:00:00.000Z');
    for (let index = 0; index < knowledgeBaseConstants.defaultInsightsCommentPageSize + 1; index += 1) {
      const createdAt = new Date(base + index * 1000);
      memory.feedbacks.set(`bulk-${index}`, {
        id: `bulk-${index}`,
        articleId: 'a1',
        userId: `user-${index}`,
        isHelpful: false,
        rating: 1,
        comment: `Komentar ${index}`,
        commentResolvedAt: null,
        createdAt,
        updatedAt: createdAt,
      });
    }

    const insights = await service.insights(asUser(knowledgeBaseTestIds.agentIt));
    expect(insights.openComments.items).toHaveLength(
      knowledgeBaseConstants.defaultInsightsCommentPageSize,
    );
    expect(insights.openComments.hasMore).toBe(true);
    expect(insights.openComments.nextCursor).not.toBeNull();
  });

  it('keeps the comment feed to curators (W7.90)', async () => {
    const { service } = createPortalHarness();
    await expect(
      service.insightsComments(asUser(knowledgeBaseTestIds.requester)),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('pages the category tree by roots and keeps archived ones out of a reader page (W7.90)', async () => {
    const { service, categories } = createPortalHarness();
    const root = (id: string, sortOrder: number) => ({
      id,
      key: id,
      nameBs: id,
      nameEn: id,
      icon: 'wifi',
      sortOrder,
      parentId: null,
      isArchived: false,
    });
    categories.set('root-a', root('root-a', 0));
    categories.set('root-b', root('root-b', 1));
    categories.set('root-c', root('root-c', 2));
    categories.set('gone', { ...root('gone', 3), isArchived: true });
    categories.set('child-a1', {
      id: 'child-a1',
      key: 'child-a1',
      nameBs: 'VPN',
      nameEn: 'VPN',
      icon: 'shield',
      sortOrder: 0,
      parentId: 'root-a',
      isArchived: false,
    });

    const requester = asUser(knowledgeBaseTestIds.requester);
    const first = await service.categories(requester, false, { limit: 2 });
    // A page is counted in roots: root-a brings its child, root-b has none.
    expect(first.items.map((item) => item.id)).toEqual(['root-a', 'root-b', 'child-a1']);
    expect(first.hasMore).toBe(true);

    const second = await service.categories(requester, false, {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((item) => item.id)).toEqual(['root-c']);
    expect(second.hasMore).toBe(false);

    // `includeArchived` is a manager capability, so a reader asking for it still sees the active tree.
    const readerWithArchived = await service.categories(requester, true, { limit: 100 });
    expect(readerWithArchived.items.map((item) => item.id)).not.toContain('gone');

    const manager = await service.categories(asUser(knowledgeBaseTestIds.superAdmin), true, {
      limit: 100,
    });
    expect(manager.items.map((item) => item.id)).toContain('gone');
  });

  it('flags the home category tree as incomplete when the taxonomy exceeds one page (W7.90)', async () => {
    const { service, categories } = createPortalHarness();
    for (let index = 0; index <= knowledgeBaseConstants.defaultCategoryPageSize; index += 1) {
      const id = `taxonomy-${index}`;
      categories.set(id, {
        id,
        key: id,
        nameBs: `Kategorija ${index}`,
        nameEn: `Category ${index}`,
        icon: 'wifi',
        sortOrder: index,
        parentId: null,
        isArchived: false,
      });
    }

    const home = await service.home(asUser(knowledgeBaseTestIds.requester));
    expect(home.categories).toHaveLength(knowledgeBaseConstants.defaultCategoryPageSize);
    expect(home.categoriesComplete).toBe(false);
  });

  it('counts the articles of an archived category as uncategorized (W7.90)', async () => {
    const { service, memory, categories } = createPortalHarness();
    categories.set('gone', {
      id: 'gone',
      key: 'gone',
      nameBs: 'Ugašena',
      nameEn: 'Retired',
      icon: 'wifi',
      sortOrder: 0,
      parentId: null,
      isArchived: true,
    });
    memory.seedArticle(publishedArticleSeed({ id: 'x1', slug: 'x1', categoryId: 'gone' }));
    memory.seedArticle(publishedArticleSeed({ id: 'x2', slug: 'x2' }));

    const requester = asUser(knowledgeBaseTestIds.requester);
    const loose = await service.categoryArticles('uncategorized', requester);
    expect(loose.items.map((item) => item.id)).toEqual(['x1', 'x2']);
    // An archived category is not a portal page, exactly as before this package.
    await expect(service.categoryArticles('gone', requester)).rejects.toMatchObject({
      response: { code: 'CATEGORY_NOT_FOUND' },
    });
  });

  it('records who resolved a comment, when, and an audit entry in the same transaction (W7.91)', async () => {
    const { service, memory, audits } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    memory.seedFeedback({
      id: 'fb-1',
      articleId: 'a1',
      userId: knowledgeBaseTestIds.requester,
      isHelpful: false,
      rating: 2,
      comment: 'Nedostaje korak 3',
      commentResolvedAt: null,
      commentResolvedByUserId: null,
    });

    const resolution = await service.resolveComment(
      'fb-1',
      asUser(knowledgeBaseTestIds.agentIt),
    );

    expect(resolution).toMatchObject({
      feedbackId: 'fb-1',
      articleId: 'a1',
      resolvedByUserId: knowledgeBaseTestIds.agentIt,
      alreadyResolved: false,
    });
    expect(Number.isNaN(Date.parse(resolution.resolvedAt))).toBe(false);
    const stored = memory.feedbacks.get('fb-1');
    expect(stored?.commentResolvedByUserId).toBe(knowledgeBaseTestIds.agentIt);
    expect(stored?.commentResolvedAt?.toISOString()).toBe(resolution.resolvedAt);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: auditLogActions.knowledgeCommentResolved,
      entityType: auditLogEntityTypes.knowledgeFeedback,
      entityId: 'fb-1',
      actorUserId: knowledgeBaseTestIds.agentIt,
      metadata: { articleId: 'a1', resolvedAt: resolution.resolvedAt },
    });
  });

  it('answers a second resolve with the first resolver and writes no second audit row (W7.91)', async () => {
    const { service, memory, audits } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    memory.seedFeedback({
      id: 'fb-1',
      articleId: 'a1',
      userId: knowledgeBaseTestIds.requester,
      isHelpful: false,
      rating: 1,
      comment: 'Nema koraka',
      commentResolvedAt: null,
      commentResolvedByUserId: null,
    });

    const first = await service.resolveComment('fb-1', asUser(knowledgeBaseTestIds.agentIt));
    const second = await service.resolveComment('fb-1', superAdmin);

    expect(first.alreadyResolved).toBe(false);
    expect(second).toMatchObject({
      alreadyResolved: true,
      // The handling stays attributed to whoever actually handled it — a second click cannot claim it.
      resolvedByUserId: knowledgeBaseTestIds.agentIt,
      resolvedAt: first.resolvedAt,
    });
    expect(memory.feedbacks.get('fb-1')?.commentResolvedByUserId).toBe(
      knowledgeBaseTestIds.agentIt,
    );
    expect(audits).toHaveLength(1);
  });

  it('lets exactly one of two parallel resolves through (W7.91)', async () => {
    const { service, memory, audits } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    memory.seedFeedback({
      id: 'fb-1',
      articleId: 'a1',
      userId: knowledgeBaseTestIds.requester,
      isHelpful: false,
      rating: 2,
      comment: 'Nedostaje korak 3',
      commentResolvedAt: null,
      commentResolvedByUserId: null,
    });

    const results = await Promise.all([
      service.resolveComment('fb-1', asUser(knowledgeBaseTestIds.agentIt)),
      service.resolveComment('fb-1', superAdmin),
    ]);

    expect(results.filter((item) => !item.alreadyResolved)).toHaveLength(1);
    expect(results.filter((item) => item.alreadyResolved)).toHaveLength(1);
    // The compare-and-set guarantees a single audit row, so "ko je riješio" has exactly one answer.
    expect(audits).toHaveLength(1);
    expect(new Set(results.map((item) => item.resolvedByUserId)).size).toBe(1);
  });

  it('refuses to resolve a comment on an article the actor cannot write (W7.91)', async () => {
    const { service, memory, audits } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    memory.seedFeedback({
      id: 'fb-1',
      articleId: 'a1',
      userId: knowledgeBaseTestIds.requester,
      isHelpful: false,
      rating: 2,
      comment: 'Nedostaje korak 3',
      commentResolvedAt: null,
      commentResolvedByUserId: null,
    });

    await expect(
      service.resolveComment('fb-1', asUser(knowledgeBaseTestIds.requester)),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(memory.feedbacks.get('fb-1')?.commentResolvedAt ?? null).toBeNull();
    expect(audits).toHaveLength(0);
  });

  it('shows insights to curators only: lowest rated needs at least 5 votes', async () => {
    const { service, memory } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'good', slug: 'good', ratingCount: 10, ratingSum: 45 }));
    memory.seedArticle(publishedArticleSeed({ id: 'bad', slug: 'bad', ratingCount: 6, ratingSum: 9 }));
    memory.seedArticle(publishedArticleSeed({ id: 'few', slug: 'few', ratingCount: 2, ratingSum: 2 }));
    await expect(service.insights(asUser(knowledgeBaseTestIds.requester))).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    const insights = await service.insights(asUser(knowledgeBaseTestIds.agentIt));
    expect(insights.lowestRated.map((item) => item.id)).toEqual(['bad', 'good']);
    expect(insights.thresholds).toEqual({ minRatings: 5, notViewedDays: 90 });
  });
});

describe('1-5 ratings (K1b)', () => {
  it('keeps exact totals, derives the thumbs flag and accepts a comment only for low ratings', async () => {
    const { discovery, memory } = createPortalHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'a1', slug: 'a1' }));
    const requester = asUser(knowledgeBaseTestIds.requester);
    const first = await discovery.submitFeedback('a1', { rating: 5 }, requester);
    expect(first).toMatchObject({ rating: 5, isHelpful: true });
    await expect(
      discovery.submitFeedback('a1', { rating: 4, comment: 'Nedostaje korak' }, requester),
    ).rejects.toMatchObject({ response: { code: 'INVALID_RATING' } });
    const second = await discovery.submitFeedback('a1', { rating: 2, comment: ' Nedostaje korak 3 ' }, requester);
    expect(second).toMatchObject({ rating: 2, isHelpful: false });
    await discovery.submitFeedback('a1', { rating: 4 }, asUser(knowledgeBaseTestIds.agentIt));
    expect(memory.articles.get('a1')).toMatchObject({ ratingCount: 2, ratingSum: 6 });
    const stored = [...memory.feedbacks.values()].find((row) => row.userId === knowledgeBaseTestIds.requester);
    expect(stored?.comment).toBe('Nedostaje korak 3');
    // Legacy thumbs still work (no rating).
    await discovery.submitFeedback('a1', { isHelpful: true }, asUser(knowledgeBaseTestIds.adminIt));
    expect(memory.articles.get('a1')).toMatchObject({ ratingCount: 2, ratingSum: 6 });
  });

  it('pulls few-vote ratings to the prior (Bayesian bonus)', () => {
    expect(knowledgeRatingBonus(0, 0)).toBe(0);
    expect(knowledgeRatingBonus(1, 5)).toBeLessThan(knowledgeRatingBonus(40, 184));
    expect(knowledgeRatingBonus(6, 9)).toBeLessThan(0);
  });
});
