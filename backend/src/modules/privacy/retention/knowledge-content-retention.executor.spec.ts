import { createKnowledgeContentRetentionExecutor } from './knowledge-content-retention.executor';
import { retentionRedactionMarker } from './retention-markers';

/*
  W7.87 (BA-knowledge-base-14): an archived article must lose its content after
  the configured period while the skeleton stays reportable (slug, status,
  placement, service/unit, owner, counters, audit trail), legal holds win, and a
  second run does nothing. Before this executor an archived article kept its
  text, the comments under it, the pointer to the source ticket, the change-log
  snapshots and the notification copies forever.
*/
describe('knowledgeContent retention executor', () => {
  const cutoff = new Date('2026-01-01T00:00:00.000Z');
  const archivedAt = new Date('2025-06-01T00:00:00.000Z');

  const rows = [
    { id: 'a1', slug: 'vpn-postavljanje', archivedAt },
    { id: 'a2', slug: 'lozinke', archivedAt },
  ];

  function fakePrisma(
    articles: unknown[] = rows,
    orphans: { id: string; entityId: string; createdAt: Date }[] = [],
    orphanWindow: { count: number; oldest: Date | null; newest: Date | null } = {
      count: orphans.length,
      oldest: orphans.at(0)?.createdAt ?? null,
      newest: orphans.at(-1)?.createdAt ?? null,
    },
  ) {
    const tx = {
      knowledgeArticle: {
        count: jest.fn().mockResolvedValue(articles.length),
        findMany: jest.fn().mockImplementation((args: { select?: Record<string, unknown> }) =>
          Promise.resolve(
            args.select !== undefined && 'id' in args.select
              ? articles
              : articles.map((row) => ({ archivedAt: (row as { archivedAt: Date }).archivedAt })),
          ),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: articles.length }),
      },
      knowledgeFeedback: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      knowledgeArticleView: { deleteMany: jest.fn().mockResolvedValue({ count: 7 }) },
      changeLog: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      notification: {
        findMany: jest.fn().mockResolvedValue([{ id: 'n1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      ...tx,
      // The orphan replicas are one `NOT EXISTS` query; the fake answers by shape.
      $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
        const text = strings.join('?');
        if (!text.includes('ChangeLog')) throw new Error(`neočekivan raw upit: ${text}`);
        return text.includes('count(*)')
          ? [{ count: orphanWindow.count, oldest: orphanWindow.oldest, newest: orphanWindow.newest }]
          : orphans;
      }),
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    return prisma;
  }

  const executor = (prisma: ReturnType<typeof fakePrisma>) =>
    createKnowledgeContentRetentionExecutor(prisma as never);

  it('counts archived articles that are past the period and not redacted yet', async () => {
    const prisma = fakePrisma();
    const preview = await executor(prisma).preview(cutoff);

    expect(preview.count).toBe(2);
    expect(preview.oldestAt?.toISOString()).toBe(archivedAt.toISOString());
    expect(preview.newestAt?.toISOString()).toBe(archivedAt.toISOString());
    const [call] = prisma.knowledgeArticle.findMany.mock.calls[0] as [{ where: unknown }];
    const serialized = JSON.stringify(call.where);
    expect(serialized).toContain('"status":"ARCHIVED"');
    expect(serialized).toContain('"archivedAt":{"lt"');
    expect(serialized).toContain(`"title":{"not":"${retentionRedactionMarker}"}`);
    // Legal holds on the owner and the reviewer keep the article intact.
    expect(serialized).toContain('"ownerUser":{"legalHoldAt":null}');
    expect(serialized).toContain('"reviewerUser":{"legalHoldAt":null}');
  });

  it('redacts the content and clears the source pointer in one transaction', async () => {
    const prisma = fakePrisma();
    const batch = await executor(prisma).executeBatch(cutoff);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [call] = prisma.knowledgeArticle.updateMany.mock.calls[0] as [
      { where: { id: { in: string[] }; title: { not: string } }; data: Record<string, unknown> },
    ];
    expect(call.where.id.in).toEqual(['a1', 'a2']);
    expect(call.where.title.not).toBe(retentionRedactionMarker);
    expect(call.data).toEqual({
      title: retentionRedactionMarker,
      body: retentionRedactionMarker,
      sourceTicketId: null,
      sourceMessageId: null,
    });
    // Nothing that keeps the article reportable or linkable is touched.
    for (const kept of [
      'slug',
      'status',
      'classification',
      'categoryId',
      'serviceId',
      'organizationalUnitId',
      'ownerUserId',
      'reviewerUserId',
      'viewCount',
      'ratingCount',
      'ratingSum',
      'archivedAt',
    ]) {
      expect(Object.keys(call.data)).not.toContain(kept);
    }
    expect(batch.items).toBe(2);
    expect(batch.refs).toEqual(['vpn-postavljanje', 'lozinke']);
    expect(batch.done).toBe(true);
  });

  it('redacts the replicas: comments, daily views, change log snapshots and inbox copies', async () => {
    const prisma = fakePrisma();
    await executor(prisma).executeBatch(cutoff);

    // Free-text comments go; the rating, the helpful flag and the "handled"
    // marker stay (they are not personal data).
    expect(prisma.knowledgeFeedback.updateMany).toHaveBeenCalledWith({
      where: { articleId: { in: ['a1', 'a2'] }, comment: { not: null } },
      data: { comment: null },
    });
    // Old per-day rows are dropped; the aggregate counter on the article stays.
    expect(prisma.knowledgeArticleView.deleteMany).toHaveBeenCalledWith({
      where: { articleId: { in: ['a1', 'a2'] }, day: { lt: cutoff } },
    });
    // The change-log snapshot stores the title, so the whole diff goes.
    expect(prisma.changeLog.updateMany).toHaveBeenCalledWith({
      where: { entityType: 'knowledge_article', entityId: { in: ['a1', 'a2'] } },
      data: { reason: retentionRedactionMarker, diff: { redacted: retentionRedactionMarker } },
    });
    // The in-app copy points at the article through payload.articleId.
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ payload: { path: ['articleId'], equals: 'a1' } }, { payload: { path: ['articleId'], equals: 'a2' } }] },
      }),
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1'] } },
      data: { body: null },
    });
  });

  it('does nothing when the batch is empty', async () => {
    const prisma = fakePrisma([]);
    const batch = await executor(prisma).executeBatch(cutoff);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(batch).toEqual({
      items: 0,
      bytes: 0n,
      refs: [],
      oldestAt: null,
      newestAt: null,
      done: true,
      failures: 0,
    });
  });

  it('redacts the change-log trail of an article that was deleted (W7.88)', async () => {
    const removedAt = new Date('2025-05-01T00:00:00.000Z');
    const orphans = [
      { id: 'log-2', entityId: 'gone-2', createdAt: removedAt },
      { id: 'log-1', entityId: 'gone-1', createdAt: removedAt },
      { id: 'log-3', entityId: 'gone-1', createdAt: new Date('2025-05-02T00:00:00.000Z') },
    ];
    const prisma = fakePrisma([], orphans);
    const preview = await executor(prisma).preview(cutoff);

    // The operator sees the replicas too - they are rows this category changes.
    expect(preview.count).toBe(3);
    expect(preview.oldestAt?.toISOString()).toBe(removedAt.toISOString());
    expect(preview.newestAt?.toISOString()).toBe('2025-05-02T00:00:00.000Z');

    const batch = await executor(prisma).executeBatch(cutoff);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.changeLog.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['log-2', 'log-1', 'log-3'] }, reason: { not: retentionRedactionMarker } },
      data: { reason: retentionRedactionMarker, diff: { redacted: retentionRedactionMarker } },
    });
    expect(batch.items).toBe(3);
    // No slug exists for a deleted article; the ref names the row it came from.
    expect(batch.refs).toEqual(['deleted:gone-2', 'deleted:gone-1']);
    expect(batch.done).toBe(true);
    // Nothing to redact on the articles themselves.
    expect(prisma.knowledgeArticle.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('keeps draining while the orphan replicas fill a whole batch', async () => {
    const orphans = Array.from({ length: 100 }, (_, index) => ({
      id: `log-${index}`,
      entityId: `gone-${index}`,
      createdAt: new Date('2025-05-01T00:00:00.000Z'),
    }));
    const prisma = fakePrisma([], orphans);
    const batch = await executor(prisma).executeBatch(cutoff);

    expect(batch.items).toBe(100);
    expect(batch.done).toBe(false);
  });

  it('reports an unfinished batch when the cap is reached', async () => {
    const many = Array.from({ length: 100 }, (_, index) => ({
      id: `a${index}`,
      slug: `slug-${index}`,
      archivedAt,
    }));
    const prisma = fakePrisma(many);
    const batch = await executor(prisma).executeBatch(cutoff);

    expect(batch.items).toBe(100);
    expect(batch.done).toBe(false);
  });
});
