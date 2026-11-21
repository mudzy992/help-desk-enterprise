import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { createTestAuthorizationContext } from '../authorization/create-test-authorization-context';
import { KnowledgePortalService } from './portal/knowledge-portal.service';

/**
 * W7.83 (`BA-knowledge-base-09`): a placement and its change-log entry are one write.
 *
 * The unit spec pins the service's ordering; this file proves the two database facts the ordering rests on, both
 * of them statements PostgreSQL alone can answer: the compare-and-set predicate only matches the row the request
 * actually read (so a writer that landed in between is rejected instead of overwritten), and a failing change-log
 * insert takes the placement with it (so the article never moves without a trace).
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('knowledge article placement atomicity (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  const suffix = `${process.pid}-${Date.now()}`;
  let organizationalUnitId = '';
  let categoryA = '';
  let categoryB = '';
  let serviceId = '';
  let articleId = '';

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT placement ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-placement-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-placement-${suffix}`,
      },
    });
    organizationalUnitId = unit.id;
    const category = await database().serviceCategory.create({
      data: { name: `IT placement category ${suffix}`, slug: `it-placement-cat-${suffix}` },
    });
    serviceId = (
      await database().service.create({
        data: { name: `IT placement service ${suffix}`, slug: `it-placement-svc-${suffix}`, categoryId: category.id },
      })
    ).id;
    categoryA = (await database().knowledgeCategory.create({
      data: { key: `placement-a-${suffix}`, nameBs: 'Mreža', nameEn: 'Network', icon: 'wifi' },
    })).id;
    categoryB = (await database().knowledgeCategory.create({
      data: { key: `placement-b-${suffix}`, nameBs: 'Ostalo', nameEn: 'Other', icon: 'book-open' },
    })).id;
    articleId = (await database().knowledgeArticle.create({
      data: {
        slug: `it-placement-article-${suffix}`,
        title: 'Article under placement test',
        body: 'Body of the article.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        serviceId,
        organizationalUnitId,
      },
      select: { id: true },
    })).id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    await db.changeLog.deleteMany({ where: { entityId: articleId } });
    if (articleId !== '') await db.knowledgeArticle.delete({ where: { id: articleId } });
    if (categoryA !== '') await db.knowledgeCategory.delete({ where: { id: categoryA } });
    if (categoryB !== '') await db.knowledgeCategory.delete({ where: { id: categoryB } });
    if (serviceId !== '') await db.service.delete({ where: { id: serviceId } });
    if (organizationalUnitId !== '') {
      await db.organizationalUnit.delete({ where: { id: organizationalUnitId } });
    }
    await db.$disconnect();
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  function portalService(client: PrismaClient): KnowledgePortalService {
    return new KnowledgePortalService(
      client as never,
      {
        loadBySubjectId: async (subjectId: string) =>
          createTestAuthorizationContext({ subjectId, isSuperAdmin: true }),
      } as never,
      { load: async () => ({}) } as never,
      { getSetting: async () => undefined } as never,
    );
  }

  async function placement() {
    return database().knowledgeArticle.findUniqueOrThrow({
      where: { id: articleId },
      select: { categoryId: true, isFaq: true, faqOrder: true },
    });
  }

  it('only lets the placement land on the row the request read', async () => {
    const readAt = await database().knowledgeArticle.findUniqueOrThrow({
      where: { id: articleId },
      select: { updatedAt: true },
    });

    // Another writer commits between our read and our write.
    await database().knowledgeArticle.update({
      where: { id: articleId },
      data: { categoryId: categoryB },
    });

    const placed = await database().knowledgeArticle.updateMany({
      where: { id: articleId, updatedAt: readAt.updatedAt },
      data: { categoryId: categoryA, isFaq: true, faqOrder: 1 },
    });

    // The predicate matches nothing, so the other writer's state survives instead of being overwritten.
    expect(placed.count).toBe(0);
    expect(await placement()).toMatchObject({ categoryId: categoryB, isFaq: false, faqOrder: null });
  });

  it('takes the placement with it when the change log cannot be written', async () => {
    const before = await placement();
    const client = database();
    const originalTransaction = client.$transaction.bind(client);
    // The change-log insert is the last statement of the transaction: if it fails, the placement must not stay.
    (client as unknown as { $transaction: unknown }).$transaction = (
      callback: (transaction: unknown) => Promise<unknown>,
    ) =>
      originalTransaction((transaction) =>
        callback(
          new Proxy(transaction as object, {
            get(target, property, receiver) {
              if (property === 'changeLog') {
                return {
                  create: async () => {
                    throw new Error('change log unavailable');
                  },
                };
              }
              return Reflect.get(target, property, receiver);
            },
          }),
        ),
      );

    try {
      await expect(
        portalService(client).placeArticle(
          articleId,
          { categoryId: categoryA, reason: 'Portal' },
          { actorUserId: 'user-placement-test' },
        ),
      ).rejects.toBeDefined();
    } finally {
      (client as unknown as { $transaction: unknown }).$transaction = originalTransaction;
    }

    // Same category as before the failed call, and no change-log row claiming otherwise.
    expect(await placement()).toMatchObject({ categoryId: before.categoryId });
    expect(await database().changeLog.count({ where: { entityId: articleId } })).toBe(0);
  });
});
