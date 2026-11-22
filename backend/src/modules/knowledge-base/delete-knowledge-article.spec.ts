import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { changeLogActions } from '../change-log/change-log.constants';
import { deleteKnowledgeArticle } from './delete-knowledge-article';
import { KnowledgeBaseError } from './knowledge-base.error';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

/*
  W7.88 (BA-knowledge-base-15): the delete path is a tombstone, not a bare
  `delete()`. Only a retired article may be removed (archived, or never
  published), and the removal leaves a content-free audit entry with the counters
  the cascade destroyed, empties the inbox copies and keeps the change-log trail.
  Before this spec the DELETE endpoint was SUPER_ADMIN-only but uninspected: it
  could take a live PUBLISHED article (and its feedback and views) out of the
  product without a single durable record beyond the change log.
*/
describe('deleteKnowledgeArticle (W7.88 tombstone policy)', () => {
  const archivedAt = new Date('2025-06-01T00:00:00.000Z');

  function article(over: Partial<KnowledgeArticleRecord> = {}): KnowledgeArticleRecord {
    return {
      id: 'a1',
      slug: 'vpn-postavljanje',
      title: 'VPN za Amra Petrović',
      body: 'Pošaljite upit na amra.petrovic@example.ba.',
      status: 'ARCHIVED',
      classification: 'INTERNAL',
      isStale: false,
      reviewDueAt: null,
      publishedAt: new Date('2024-01-01T00:00:00.000Z'),
      lastReviewedAt: null,
      archivedAt,
      ownerUserId: 'owner-1',
      ownerGroupId: null,
      reviewerUserId: 'reviewer-1',
      serviceId: 'svc-1',
      organizationalUnitId: 'ou-1',
      createdAt: new Date('2023-12-01T00:00:00.000Z'),
      updatedAt: new Date('2025-06-01T00:00:00.000Z'),
      categoryId: null,
      isFaq: false,
      faqOrder: null,
      ratingCount: 3,
      ratingSum: 12,
      viewCount: 240,
      sourceTicketId: null,
      sourceMessageId: null,
      ...over,
    };
  }

  function fakePrisma(record: KnowledgeArticleRecord | null = article()) {
    const tx = {
      knowledgeArticle: {
        delete: jest.fn().mockResolvedValue(record),
      },
      knowledgeFeedback: { count: jest.fn().mockResolvedValue(4) },
      knowledgeArticleView: { count: jest.fn().mockResolvedValue(2) },
      notification: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      changeLog: { create: jest.fn().mockResolvedValue({}) },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      ...tx,
      knowledgeArticle: {
        ...tx.knowledgeArticle,
        findUnique: jest.fn().mockResolvedValue(record),
      },
      // The transaction client is the only writer: nothing may reach the outer one.
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    return prisma;
  }

  const context = { actorUserId: 'admin-1', requestId: null, sessionId: null } as never;
  const input = { reason: 'Članak više nije potreban' };

  it('refuses a published article and touches nothing', async () => {
    const prisma = fakePrisma(article({ status: 'PUBLISHED' }));

    await expect(deleteKnowledgeArticle(prisma as never, 'a1', input, context)).rejects.toMatchObject({
      code: 'ARTICLE_NOT_RETIRED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.knowledgeArticle.delete).not.toHaveBeenCalled();
  });

  it('refuses an article that is still in review even without a live page', async () => {
    const prisma = fakePrisma(article({ status: 'IN_REVIEW' }));

    await expect(deleteKnowledgeArticle(prisma as never, 'a1', input, context)).rejects.toMatchObject({
      code: 'ARTICLE_NOT_RETIRED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats a draft that was once published as live: it carries history', async () => {
    // A content edit of a published article moves it back to DRAFT, so
    // `publishedAt` - not the status alone - decides whether the URL ever existed.
    const prisma = fakePrisma(article({ status: 'DRAFT' }));

    await expect(deleteKnowledgeArticle(prisma as never, 'a1', input, context)).rejects.toMatchObject({
      code: 'ARTICLE_NOT_RETIRED',
    });
  });

  it('deletes a never-published draft', async () => {
    const prisma = fakePrisma(article({ status: 'DRAFT', publishedAt: null }));

    await deleteKnowledgeArticle(prisma as never, 'a1', { reason: '  Greška u unosu  ' }, context);

    const [call] = prisma.knowledgeArticle.delete.mock.calls[0] as [{ where: { id: string } }];
    expect(call.where.id).toBe('a1');
    const audit = prisma.auditLog.create.mock.calls[0] as [{ data: { metadata: Record<string, unknown> } }];
    expect(audit[0].data.metadata).toMatchObject({ reason: 'Greška u unosu', status: 'DRAFT' });
  });

  it('deletes an archived article and leaves a content-free tombstone with the counters', async () => {
    const prisma = fakePrisma();

    await deleteKnowledgeArticle(prisma as never, 'a1', input, context);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // 1. The change-log trail still carries the snapshot for the operator.
    const [log] = prisma.changeLog.create.mock.calls[0] as [
      { data: { entityType: string; entityId: string; reason: string; diff: unknown } },
    ];
    expect(log.data).toMatchObject({
      entityType: 'knowledge_article',
      entityId: 'a1',
      reason: 'Članak više nije potreban',
    });
    expect(JSON.stringify(log.data.diff)).toContain('VPN za Amra Petrović');

    // 2. The audit entry records the deletion and the numbers the cascade destroys.
    const [audit] = prisma.auditLog.create.mock.calls[0] as [
      { data: { action: string; entityType: string; entityId: string; metadata: Record<string, unknown> } },
    ];
    expect(audit.data.action).toBe(auditLogActions.knowledgeArticleDeleted);
    expect(audit.data.entityType).toBe(auditLogEntityTypes.knowledgeArticle);
    expect(audit.data.entityId).toBe('a1');
    expect(audit.data.metadata).toEqual({
      slug: 'vpn-postavljanje',
      status: 'ARCHIVED',
      classification: 'INTERNAL',
      serviceId: 'svc-1',
      organizationalUnitId: 'ou-1',
      ownerUserId: 'owner-1',
      reviewerUserId: 'reviewer-1',
      feedbackCount: 4,
      viewDays: 2,
      viewCount: 240,
      ratingCount: 3,
      ratingSum: 12,
      reason: 'Članak više nije potreban',
      deletedAt: expect.any(String),
    });
    // The content must not outlive the row it described.
    expect(Object.keys(audit.data.metadata)).not.toContain('title');
    expect(Object.keys(audit.data.metadata)).not.toContain('body');
    expect(JSON.stringify(audit.data.metadata)).not.toContain('Amra');

    // 3. The inbox copies lose the body; the pointer stays for the trail.
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { payload: { path: ['articleId'], equals: 'a1' }, body: { not: null } },
      data: { body: null },
    });

    // 4. The row goes (feedback and daily views cascade with it).
    expect(prisma.knowledgeArticle.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('refuses an empty reason before the transaction opens', async () => {
    const prisma = fakePrisma();

    await expect(deleteKnowledgeArticle(prisma as never, 'a1', { reason: '   ' }, context)).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls the delete back when the audit chain refuses the entry', async () => {
    const prisma = fakePrisma();
    prisma.auditLog.create.mockRejectedValueOnce(new Error('AUDIT_METADATA_FIELD_NOT_ALLOWED'));

    await expect(deleteKnowledgeArticle(prisma as never, 'a1', input, context)).rejects.toThrow(
      'AUDIT_METADATA_FIELD_NOT_ALLOWED',
    );
    // The audit write runs before the delete, so a refused entry cannot leave a
    // vanished article with no trail.
    expect(prisma.knowledgeArticle.delete).not.toHaveBeenCalled();
  });

  it('reports a missing article as NOT_FOUND, not as a policy refusal', async () => {
    const prisma = fakePrisma(null);

    await expect(deleteKnowledgeArticle(prisma as never, 'a1', input, context)).rejects.toBeInstanceOf(
      KnowledgeBaseError,
    );
    await expect(deleteKnowledgeArticle(prisma as never, 'a1', input, context)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the same delete action in the change log', async () => {
    const prisma = fakePrisma();
    await deleteKnowledgeArticle(prisma as never, 'a1', input, context);
    const [log] = prisma.changeLog.create.mock.calls[0] as [{ data: { diff: { action?: string } } }];
    expect(log.data.diff.action).toBe(changeLogActions.delete);
  });
});
