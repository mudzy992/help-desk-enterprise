import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import {
  findKnowledgeDraftFromReply,
  withKnowledgeFromReplyLock,
} from './portal/knowledge-from-reply-lock';

/**
 * W7.82 (`BA-knowledge-base-08`): "one reply, one draft" is a database fact, not a convention.
 *
 * `KnowledgeArticle` has no unique key over `(sourceTicketId, sourceMessageId)` — that would be a migration — so
 * the guarantee rests on two things this file proves against a real PostgreSQL: the advisory lock serialises the
 * writers of the same reply, and the read **after** the lock sees the draft the winner committed (PostgreSQL takes
 * a fresh snapshot per statement under READ COMMITTED). The second test pins the other half: a failure after the
 * article insert takes the article with it, so a retry starts from nothing instead of leaving a draft behind.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('knowledge article from a reply (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let categoryId = '';
  let serviceId = '';
  const suffix = `${process.pid}-${Date.now()}`;
  const ticketId = `it-kb-reply-ticket-${suffix}`;
  const createdIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT from-reply ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-from-reply-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-from-reply-${suffix}`,
      },
    });
    organizationalUnitId = unit.id;
    const category = await database().serviceCategory.create({
      data: { name: `IT from-reply category ${suffix}`, slug: `it-from-reply-cat-${suffix}` },
    });
    categoryId = category.id;
    const service = await database().service.create({
      data: { name: `IT from-reply service ${suffix}`, slug: `it-from-reply-svc-${suffix}`, categoryId },
    });
    serviceId = service.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    await db.knowledgeArticle.deleteMany({ where: { sourceTicketId: ticketId } });
    if (serviceId !== '') await db.service.delete({ where: { id: serviceId } });
    if (categoryId !== '') await db.serviceCategory.delete({ where: { id: categoryId } });
    if (organizationalUnitId !== '') {
      await db.organizationalUnit.delete({ where: { id: organizationalUnitId } });
    }
    await db.$disconnect();
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  /** Mirrors what `createFromReply` does inside its transaction, without the HTTP/authorization plumbing. */
  function createDraftInLockedTransaction(messageId: string, slug: string) {
    return database().$transaction((transaction) =>
      withKnowledgeFromReplyLock(transaction, ticketId, messageId, async () => {
        const existing = await findKnowledgeDraftFromReply(
          transaction as never,
          ticketId,
          messageId,
        );
        if (existing !== null) return { created: false as const, id: existing.id };
        const article = await transaction.knowledgeArticle.create({
          data: {
            slug,
            title: 'Draft from a reply',
            body: 'Body of the draft.',
            status: 'DRAFT',
            serviceId,
            organizationalUnitId,
            sourceTicketId: ticketId,
            sourceMessageId: messageId,
          },
          select: { id: true },
        });
        createdIds.push(article.id);
        return { created: true as const, id: article.id };
      }),
    );
  }

  it('lets two writers of the same reply produce exactly one draft', async () => {
    const messageId = `it-kb-reply-message-race-${suffix}`;
    const results = await Promise.all([
      createDraftInLockedTransaction(messageId, `it-kb-reply-race-a-${suffix}`),
      createDraftInLockedTransaction(messageId, `it-kb-reply-race-b-${suffix}`),
    ]);

    // Exactly one writer created; the other found that draft after the lock was released.
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(
      await database().knowledgeArticle.count({
        where: { sourceTicketId: ticketId, sourceMessageId: messageId },
      }),
    ).toBe(1);
  });

  it('takes a failed draft with it, so the retry creates the one draft and no orphan', async () => {
    const messageId = `it-kb-reply-message-rollback-${suffix}`;
    await expect(
      database().$transaction((transaction) =>
        withKnowledgeFromReplyLock(transaction, ticketId, messageId, async () => {
          await transaction.knowledgeArticle.create({
            data: {
              slug: `it-kb-reply-rollback-${suffix}`,
              title: 'Draft that never lands',
              body: 'Body of the draft.',
              status: 'DRAFT',
              serviceId,
              organizationalUnitId,
              sourceTicketId: ticketId,
              sourceMessageId: messageId,
            },
          });
          // The ticket trace or the audit failed after the article was written.
          throw new Error('audit unavailable');
        }),
      ),
    ).rejects.toThrow('audit unavailable');

    expect(
      await database().knowledgeArticle.count({
        where: { sourceTicketId: ticketId, sourceMessageId: messageId },
      }),
    ).toBe(0);

    const retried = await createDraftInLockedTransaction(
      messageId,
      `it-kb-reply-retry-${suffix}`,
    );
    expect(retried.created).toBe(true);
    expect(
      await database().knowledgeArticle.count({
        where: { sourceTicketId: ticketId, sourceMessageId: messageId },
      }),
    ).toBe(1);
  });
});
