import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { createTestAuthorizationContext } from '../authorization/create-test-authorization-context';
import { deleteKnowledgeArticle } from './delete-knowledge-article';
import { KnowledgeBaseService } from './knowledge-base.service';

/**
 * W7.88 (`BA-knowledge-base-15`): a hard delete is a tombstone, not a bare `delete()`.
 *
 * The unit spec pins the policy and the order of the writes; this file proves the
 * database facts behind them: the row, its feedback and its daily views really do
 * cascade away, the audit-chain row really does survive the row it describes (with
 * the counters and without the title), the change-log snapshot stays for the
 * operator trail, the inbox copy loses its body, and a PUBLISHED article is refused
 * by the service with a 409 instead of disappearing from the product.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('knowledge article delete tombstone (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  const suffix = `${process.pid}-${Date.now()}`;
  let organizationalUnitId = '';
  let serviceId = '';
  let userId = '';
  let publishedId = '';
  let adminUserId = '';
  let draftId = '';
  let notificationId = '';

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT delete ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-delete-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-delete-${suffix}`,
      },
    });
    organizationalUnitId = unit.id;
    const category = await database().serviceCategory.create({
      data: { name: `IT delete category ${suffix}`, slug: `it-delete-cat-${suffix}` },
    });
    serviceId = (
      await database().service.create({
        data: { name: `IT delete service ${suffix}`, slug: `it-delete-svc-${suffix}`, categoryId: category.id },
      })
    ).id;
    userId = (
      await database().user.create({
        data: { email: `it-delete-${suffix}@example.test`, displayName: 'IT Delete Reader' },
      })
    ).id;
    adminUserId = (
      await database().user.create({
        data: { email: `it-delete-admin-${suffix}@example.test`, displayName: 'IT Delete Admin' },
      })
    ).id;

    publishedId = (
      await database().knowledgeArticle.create({
        data: {
          slug: `it-delete-published-${suffix}`,
          title: 'VPN za Amra Petrović',
          body: 'Uputstvo sa imenom.',
          status: 'PUBLISHED',
          publishedAt: new Date('2024-01-01T00:00:00.000Z'),
          viewCount: 240,
          ratingCount: 1,
          ratingSum: 2,
          serviceId,
          organizationalUnitId,
        },
        select: { id: true },
      })
    ).id;
    await database().knowledgeFeedback.create({
      data: { articleId: publishedId, userId, isHelpful: false, rating: 2, comment: 'Nedostaje primjer.' },
    });
    await database().knowledgeArticleView.createMany({
      data: [
        { articleId: publishedId, day: new Date('2026-01-01T00:00:00.000Z'), views: 4, uniqueViewers: 2 },
        { articleId: publishedId, day: new Date('2026-01-02T00:00:00.000Z'), views: 3, uniqueViewers: 1 },
      ],
    });
    notificationId = (
      await database().notification.create({
        data: {
          userId,
          type: 'knowledge.review.due',
          title: 'Pregled članka',
          body: 'Pregledajte članak VPN za Amra Petrović.',
          dedupeKey: `it-delete-${suffix}`,
          payload: { articleId: publishedId },
        },
        select: { id: true },
      })
    ).id;

    draftId = (
      await database().knowledgeArticle.create({
        data: {
          slug: `it-delete-draft-${suffix}`,
          title: 'Nacrt bez historije',
          body: 'Nikad objavljen.',
          status: 'DRAFT',
          serviceId,
          organizationalUnitId,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    const ids = [publishedId, draftId].filter((id) => id !== '');
    await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await db.changeLog.deleteMany({ where: { entityId: { in: ids } } });
    if (notificationId !== '') await db.notification.delete({ where: { id: notificationId } });
    await db.knowledgeFeedback.deleteMany({ where: { articleId: { in: ids } } });
    await db.knowledgeArticleView.deleteMany({ where: { articleId: { in: ids } } });
    await db.knowledgeArticle.deleteMany({ where: { id: { in: ids } } });
    if (serviceId !== '') await db.service.delete({ where: { id: serviceId } });
    if (userId !== '') await db.user.delete({ where: { id: userId } });
    if (organizationalUnitId !== '') await db.organizationalUnit.delete({ where: { id: organizationalUnitId } });
    await db.$disconnect();
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  function service(client: PrismaClient): KnowledgeBaseService {
    return new KnowledgeBaseService(
      client as never,
      {
        loadBySubjectId: async (subjectId: string) =>
          createTestAuthorizationContext({ subjectId, isSuperAdmin: true }),
      } as never,
      { load: async () => ({}) } as never,
    );
  }

  // ChangeLog.actorUserId carries a foreign key (unlike AuditLog), so the actor has to be a real row.
  const context = () => ({ actorUserId: adminUserId, requestId: null, sessionId: null }) as never;

  it('refuses a published article with a 409 and leaves everything in place', async () => {
    const error = await service(database())
      .remove(publishedId, { reason: 'Brisanje objavljenog članka' }, context())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'ARTICLE_NOT_RETIRED' });
    expect(await database().knowledgeArticle.count({ where: { id: publishedId } })).toBe(1);
    expect(await database().knowledgeFeedback.count({ where: { articleId: publishedId } })).toBe(1);
    expect(await database().auditLog.count({ where: { entityId: publishedId } })).toBe(0);
  });

  it('deletes an archived article and keeps a content-free tombstone', async () => {
    await database().knowledgeArticle.update({
      where: { id: publishedId },
      data: { status: 'ARCHIVED', archivedAt: new Date('2025-01-01T00:00:00.000Z') },
    });

    await deleteKnowledgeArticle(database() as never, publishedId, { reason: 'Članak više nije potreban' }, context());

    // The row and the rows that cascaded with it are gone.
    expect(await database().knowledgeArticle.count({ where: { id: publishedId } })).toBe(0);
    expect(await database().knowledgeFeedback.count({ where: { articleId: publishedId } })).toBe(0);
    expect(await database().knowledgeArticleView.count({ where: { articleId: publishedId } })).toBe(0);

    // The change-log trail keeps the snapshot for the operator.
    const log = await database().changeLog.findFirstOrThrow({ where: { entityId: publishedId } });
    expect(log.reason).toBe('Članak više nije potreban');
    expect(JSON.stringify(log.diff)).toContain('VPN za Amra Petrović');

    // The audit chain keeps the numbers and none of the text.
    const audit = await database().auditLog.findFirstOrThrow({
      where: { entityId: publishedId, action: auditLogActions.knowledgeArticleDeleted },
    });
    expect(audit.entityType).toBe(auditLogEntityTypes.knowledgeArticle);
    expect(audit.metadata).toMatchObject({
      slug: `it-delete-published-${suffix}`,
      status: 'ARCHIVED',
      feedbackCount: 1,
      viewDays: 2,
      viewCount: 240,
      ratingCount: 1,
      ratingSum: 2,
      reason: 'Članak više nije potreban',
    });
    expect(JSON.stringify(audit.metadata)).not.toContain('Amra');
    expect(JSON.stringify(audit.metadata)).not.toContain('Uputstvo sa imenom');

    // The inbox copy loses the title it copied; the pointer stays for the trail.
    const copy = await database().notification.findUniqueOrThrow({ where: { id: notificationId } });
    expect(copy.body).toBeNull();
    expect(copy.payload).toMatchObject({ articleId: publishedId });

    // The article is gone for good: the endpoint reports 404 now.
    const second = await service(database())
      .remove(publishedId, { reason: 'Ponovni pokušaj' }, context())
      .catch((caught: unknown) => caught);
    expect(second).toBeInstanceOf(NotFoundException);
  });

  it('deletes a draft that was never published', async () => {
    await deleteKnowledgeArticle(database() as never, draftId, { reason: 'Greška u unosu' }, context());

    expect(await database().knowledgeArticle.count({ where: { id: draftId } })).toBe(0);
    const audit = await database().auditLog.findFirstOrThrow({
      where: { entityId: draftId, action: auditLogActions.knowledgeArticleDeleted },
    });
    expect(audit.metadata).toMatchObject({ status: 'DRAFT', feedbackCount: 0, viewDays: 0 });
  });
});
