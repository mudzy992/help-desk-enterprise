import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { createTestAuthorizationContext } from '../../authorization/create-test-authorization-context';
import { KnowledgePortalService } from './knowledge-portal.service';

/**
 * W7.91 (`BA-knowledge-base-18`): resolving a reader's comment is a fact with an actor, and the guarantees
 * behind that are database facts — a compare-and-set on `commentResolvedAt IS NULL`, an audit row that
 * commits with it, and a resolver FK that survives a later user deletion. The unit spec pins the ordering;
 * this file proves the substrate under a real PostgreSQL, where two curators actually race.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('knowledge comment resolution (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let categoryId = '';
  let serviceId = '';
  let articleId = '';
  let feedbackId = '';
  let requesterId = '';
  let firstResolverId = '';
  let secondResolverId = '';
  const suffix = `${process.pid}-${Date.now()}`;

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  function service(): KnowledgePortalService {
    return new KnowledgePortalService(
      database() as never,
      {
        loadBySubjectId: async (subjectId: string) =>
          createTestAuthorizationContext({ subjectId, isSuperAdmin: true }),
      } as never,
      {
        load: async () => ({
          interceptEnabled: true,
          reviewCycleEnabled: false,
          defaultReviewDays: 90,
          staleAfterDays: 180,
          remindDaysBefore: 7,
          feedbackEnabled: true,
          oneVotePerUserPerArticle: true,
          useFeedbackWeight: true,
          internalCompanyWide: true,
        }),
      } as never,
      { getSetting: async () => undefined } as never,
      undefined,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT kb resolve ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-kb-resolve-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-kb-resolve-${suffix}`,
      },
    });
    organizationalUnitId = unit.id;
    const category = await database().serviceCategory.create({
      data: { name: `IT kb resolve category ${suffix}`, slug: `it-kb-resolve-cat-${suffix}` },
    });
    categoryId = category.id;
    const serviceRow = await database().service.create({
      data: {
        name: `IT kb resolve service ${suffix}`,
        slug: `it-kb-resolve-svc-${suffix}`,
        categoryId,
      },
    });
    serviceId = serviceRow.id;
    const article = await database().knowledgeArticle.create({
      data: {
        slug: `it-kb-resolve-article-${suffix}`,
        title: 'Article with an unresolved comment',
        body: 'Body of the article under test.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        serviceId,
        organizationalUnitId,
      },
      select: { id: true },
    });
    articleId = article.id;
    const [requester, first, second] = await Promise.all(
      ['requester', 'resolver-one', 'resolver-two'].map((name, index) =>
        database().user.create({
          data: {
            email: `it-kb-resolve-${index}-${suffix}@example.test`,
            displayName: `IT kb resolve ${name}`,
          },
          select: { id: true },
        }),
      ),
    );
    requesterId = requester!.id;
    firstResolverId = first!.id;
    secondResolverId = second!.id;
    const feedback = await database().knowledgeFeedback.create({
      data: {
        articleId,
        userId: requesterId,
        isHelpful: false,
        rating: 2,
        comment: 'Nedostaje korak 3',
      },
      select: { id: true },
    });
    feedbackId = feedback.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    await db.auditLog.deleteMany({ where: { entityId: feedbackId } });
    if (feedbackId !== '') await db.knowledgeFeedback.deleteMany({ where: { id: feedbackId } });
    if (articleId !== '') await db.knowledgeArticle.deleteMany({ where: { id: articleId } });
    if (serviceId !== '') await db.service.deleteMany({ where: { id: serviceId } });
    if (categoryId !== '') await db.serviceCategory.deleteMany({ where: { id: categoryId } });
    if (requesterId !== '') {
      await db.user.deleteMany({
        where: { id: { in: [requesterId, firstResolverId, secondResolverId].filter((id) => id !== '') } },
      });
    }
    if (organizationalUnitId !== '') {
      await db.organizationalUnit.deleteMany({ where: { id: organizationalUnitId } });
    }
    await db.$disconnect();
  });

  it('lets exactly one of two parallel resolves win and writes one audit row (W7.91)', async () => {
    const results = await Promise.all([
      service().resolveComment(feedbackId, { actorUserId: firstResolverId }),
      service().resolveComment(feedbackId, { actorUserId: secondResolverId }),
    ]);

    const winners = results.filter((result) => !result.alreadyResolved);
    expect(winners).toHaveLength(1);
    const winnerId = winners[0]!.resolvedByUserId;

    const stored = await database().knowledgeFeedback.findUnique({
      where: { id: feedbackId },
      select: { commentResolvedAt: true, commentResolvedByUserId: true },
    });
    expect(stored?.commentResolvedAt).not.toBeNull();
    expect(stored?.commentResolvedByUserId).toBe(winnerId);

    const audits = await database().auditLog.findMany({
      where: { entityId: feedbackId, action: auditLogActions.knowledgeCommentResolved },
      select: { actorUserId: true, entityType: true, metadata: true },
    });
    // Two clicks, one fact: the second one reports who got there first instead of writing a second proof.
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorUserId).toBe(winnerId);
    expect(audits[0]?.entityType).toBe(auditLogEntityTypes.knowledgeFeedback);
    expect(audits[0]?.metadata).toMatchObject({ articleId });
  });

  it('keeps the audit proof when the resolver account is deleted (W7.91)', async () => {
    const stored = await database().knowledgeFeedback.findUnique({
      where: { id: feedbackId },
      select: { commentResolvedByUserId: true },
    });
    const resolverId = stored?.commentResolvedByUserId ?? '';
    expect(resolverId).not.toBe('');

    // Other fixture rows reference the user; only the resolution FK is `SetNull`, so clear the votes first.
    await database().knowledgeFeedback.deleteMany({ where: { userId: resolverId, id: { not: feedbackId } } });
    await database().user.delete({ where: { id: resolverId } });

    const afterDelete = await database().knowledgeFeedback.findUnique({
      where: { id: feedbackId },
      select: { commentResolvedByUserId: true, commentResolvedAt: true },
    });
    expect(afterDelete?.commentResolvedAt).not.toBeNull();
    expect(afterDelete?.commentResolvedByUserId).toBeNull();
    const audits = await database().auditLog.count({
      where: { entityId: feedbackId, action: auditLogActions.knowledgeCommentResolved },
    });
    // The row forgets the actor because the FK is gone; the audit row is why the answer still exists.
    expect(audits).toBe(1);
  });
});
