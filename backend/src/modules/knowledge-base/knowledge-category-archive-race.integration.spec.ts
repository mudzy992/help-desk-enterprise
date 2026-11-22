import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { createTestAuthorizationContext } from '../authorization/create-test-authorization-context';
import { KnowledgePortalService } from './portal/knowledge-portal.service';

/**
 * W7.84 (`BA-knowledge-base-10`): "a category is never archived while it still holds live content" and "an article
 * is never placed into an archived category" are two halves of one invariant. Each side used to decide it alone — a
 * count-then-write on the archive side, a check-then-write on the placement side — so both could pass their own
 * check in the same instant and leave an archived category with a visible article inside.
 *
 * This file runs the two real service calls against each other, repeatedly, on PostgreSQL and asserts the
 * impossible state never survives: exactly one of the two wins, every round.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

const rounds = 5;

describeIfDatabase('knowledge category archive guard against placement (integration)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient | undefined;
  const suffix = `${process.pid}-${Date.now()}`;
  let organizationalUnitId = '';
  let serviceId = '';
  const categoryIds: string[] = [];
  const articleIds: string[] = [];
  // `ChangeLog.actorUserId` is a foreign key `AuditLog.actorUserId` is not: the actor has to be a row.
  let actorUserId = '';
  const actor = () => ({ actorUserId });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT archive race ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-archive-race-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-archive-race-${suffix}`,
      },
    });
    organizationalUnitId = unit.id;
    const serviceCategory = await database().serviceCategory.create({
      data: { name: `IT archive race category ${suffix}`, slug: `it-archive-race-cat-${suffix}` },
    });
    serviceId = (
      await database().service.create({
        data: {
          name: `IT archive race service ${suffix}`,
          slug: `it-archive-race-svc-${suffix}`,
          categoryId: serviceCategory.id,
        },
      })
    ).id;
    actorUserId = (
      await database().user.create({
        data: { email: `it-kb-archiver-${suffix}@example.test`, displayName: 'IT KB Archiver' },
      })
    ).id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    if (articleIds.length > 0) {
      await db.changeLog.deleteMany({ where: { entityId: { in: articleIds } } });
      await db.knowledgeArticle.deleteMany({ where: { id: { in: articleIds } } });
    }
    // After its change-log rows, or the actor's foreign key keeps the user alive.
    if (actorUserId !== '') await db.user.deleteMany({ where: { id: actorUserId } });
    if (categoryIds.length > 0) {
      await db.knowledgeCategory.deleteMany({ where: { id: { in: categoryIds } } });
    }
    if (serviceId !== '') {
      const service = await db.service.findUnique({ where: { id: serviceId }, select: { categoryId: true } });
      await db.service.delete({ where: { id: serviceId } });
      if (service !== null) await db.serviceCategory.delete({ where: { id: service.categoryId } });
    }
    if (organizationalUnitId !== '') {
      await db.organizationalUnit.delete({ where: { id: organizationalUnitId } });
    }
    await db.$disconnect();
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  function codeOf(result: PromiseSettledResult<unknown> | undefined): string {
    if (result === undefined || result.status !== 'rejected') return '';
    const error = result.reason as { getResponse?: () => unknown; code?: unknown };
    const response = typeof error.getResponse === 'function' ? error.getResponse() : undefined;
    if (typeof response === 'object' && response !== null && 'code' in response) {
      return String((response as { code?: unknown }).code);
    }
    return typeof error.code === 'string' ? error.code : '';
  }

  function portalService(): KnowledgePortalService {
    return new KnowledgePortalService(
      database() as never,
      {
        loadBySubjectId: async (subjectId: string) =>
          createTestAuthorizationContext({ subjectId, isSuperAdmin: true }),
      } as never,
      { load: async () => ({}) } as never,
      { getSetting: async () => undefined } as never,
    );
  }

  it('never leaves an archived category holding a placed article', async () => {
    for (let round = 0; round < rounds; round += 1) {
      const categoryId = (
        await database().knowledgeCategory.create({
          data: {
            key: `archive-race-${suffix}-${round}`,
            nameBs: `Trka ${round}`,
            nameEn: `Race ${round}`,
            icon: 'wifi',
          },
          select: { id: true },
        })
      ).id;
      categoryIds.push(categoryId);
      const articleId = (
        await database().knowledgeArticle.create({
          data: {
            slug: `it-archive-race-article-${suffix}-${round}`,
            title: `Article ${round}`,
            body: 'Body of the article.',
            status: 'PUBLISHED',
            publishedAt: new Date(),
            serviceId,
            organizationalUnitId,
          },
          select: { id: true },
        })
      ).id;
      articleIds.push(articleId);

      const service = portalService();
      const [archive, placement] = await Promise.allSettled([
        service.setCategoryArchived(categoryId, true, actor()),
        service.placeArticle(articleId, { categoryId, reason: 'Portal' }, actor()),
      ]);

      const category = await database().knowledgeCategory.findUniqueOrThrow({
        where: { id: categoryId },
        select: { isArchived: true },
      });
      const article = await database().knowledgeArticle.findUniqueOrThrow({
        where: { id: articleId },
        select: { categoryId: true },
      });
      const impossible = category.isArchived && article.categoryId === categoryId;
      const rejected = [archive, placement].find((result) => result.status === 'rejected');

      // The invariant: the two decisions are serialised, so exactly one of them lands and the impossible state
      // (archived category with a live article in it) never appears — no matter which writer went first.
      expect(impossible).toBe(false);
      expect(
        [archive.status, placement.status].filter((status) => status === 'fulfilled'),
      ).toHaveLength(1);
      // …and the loser lost *because* of the other side, not for some unrelated reason.
      expect(codeOf(rejected)).toMatch(/^(CATEGORY_NOT_EMPTY|INVALID_CATEGORY)$/u);
    }
  });

  it('refuses to archive a category that already holds a live article', async () => {
    const categoryId = (
      await database().knowledgeCategory.create({
        data: {
          key: `archive-guard-${suffix}`,
          nameBs: 'Zauzeta',
          nameEn: 'Occupied',
          icon: 'wifi',
        },
        select: { id: true },
      })
    ).id;
    categoryIds.push(categoryId);
    const articleId = (
      await database().knowledgeArticle.create({
        data: {
          slug: `it-archive-guard-article-${suffix}`,
          title: 'Guarded article',
          body: 'Body of the article.',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          serviceId,
          organizationalUnitId,
          categoryId,
        },
        select: { id: true },
      })
    ).id;
    articleIds.push(articleId);

    await expect(
      portalService().setCategoryArchived(categoryId, true, actor()),
    ).rejects.toMatchObject({ response: { code: 'CATEGORY_NOT_EMPTY' } });
    expect(
      (
        await database().knowledgeCategory.findUniqueOrThrow({
          where: { id: categoryId },
          select: { isArchived: true },
        })
      ).isArchived,
    ).toBe(false);
  });
});
