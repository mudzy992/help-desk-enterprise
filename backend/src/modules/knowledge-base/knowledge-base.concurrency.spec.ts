import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import {
  assertKnowledgeArticleRevision,
  knowledgeArticleRevisionOf,
  normalizeKnowledgeArticleRevision,
} from './knowledge-article-revision';
import { KnowledgeBaseError } from './knowledge-base.error';
import { mapKnowledgeBaseError } from './map-knowledge-base-error';
import { vpnArticleInput } from './vpn-article-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type Harness = ReturnType<typeof createKnowledgeBaseServiceHarness>;

async function draftWithReviewer(harness: Harness) {
  return harness.articles.create(vpnArticleInput(), {
    actorUserId: knowledgeBaseTestIds.agentIt,
  });
}

describe('knowledge article revision (BA-knowledge-base-03)', () => {
  it('normalizes the If-Match forms a client may send', () => {
    expect(normalizeKnowledgeArticleRevision(undefined)).toBeNull();
    expect(normalizeKnowledgeArticleRevision('   ')).toBeNull();
    expect(normalizeKnowledgeArticleRevision('2026-09-11T12:00:00.000Z')).toBe(
      '2026-09-11T12:00:00.000Z',
    );
    expect(normalizeKnowledgeArticleRevision('"2026-09-11T12:00:00.000Z"')).toBe(
      '2026-09-11T12:00:00.000Z',
    );
    expect(normalizeKnowledgeArticleRevision('W/"2026-09-11T12:00:00.000Z"')).toBe(
      '2026-09-11T12:00:00.000Z',
    );
  });

  it('maps a stale write to HTTP 409 so the client can reload', () => {
    const mapped = mapKnowledgeBaseError(new KnowledgeBaseError('STALE_WRITE'));
    expect(mapped.getStatus()).toBe(409);
    expect(mapped.getResponse()).toMatchObject({ code: 'STALE_WRITE' });
  });

  it('rejects a revision that no longer matches the row', () => {
    const article = { updatedAt: new Date('2026-09-11T12:00:00.000Z') };
    expect(() => assertKnowledgeArticleRevision(article, undefined)).not.toThrow();
    expect(() =>
      assertKnowledgeArticleRevision(article, knowledgeArticleRevisionOf(article)),
    ).not.toThrow();
    expect(() =>
      assertKnowledgeArticleRevision(article, '2026-09-11T11:59:00.000Z'),
    ).toThrow('STALE_WRITE');
  });

  it('lets the first of two edits win and rejects the stale one', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    const created = await draftWithReviewer(harness);
    const loadedRevision = created.updatedAt;

    const first = await harness.articles.update(
      created.id,
      { body: 'Prva izmjena.', reason: 'first edit' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    expect(first.body).toContain('Prva');

    await expect(
      harness.articles.update(
        created.id,
        {
          body: 'Druga izmjena preko zastarjelog ekrana.',
          reason: 'stale edit',
          expectedRevision: loadedRevision,
        },
        { actorUserId: knowledgeBaseTestIds.ownerUser },
      ),
    ).rejects.toMatchObject({ response: { code: 'STALE_WRITE' } });
    expect(
      (await harness.articles.getById(created.id, {
        actorUserId: knowledgeBaseTestIds.agentIt,
      })).body,
    ).toContain('Prva');
  });

  it('accepts the current revision and advances it after every write', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    const created = await draftWithReviewer(harness);
    const first = await harness.articles.update(
      created.id,
      {
        body: 'Prva.',
        reason: 'edit one',
        expectedRevision: created.updatedAt,
      },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    expect(Date.parse(first.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));

    const second = await harness.articles.update(
      created.id,
      {
        body: 'Druga.',
        reason: 'edit two',
        expectedRevision: first.updatedAt,
      },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    expect(second.body).toContain('Druga');
  });

  it('rejects a lifecycle decision made against a stale row', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    const created = await draftWithReviewer(harness);
    const submitted = await harness.workflow.submitReview(
      created.id,
      { reason: 'submit' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );

    await harness.workflow.approveReview(
      created.id,
      { reason: 'approve' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );

    await expect(
      harness.workflow.publish(
        created.id,
        { reason: 'publish with old token', expectedRevision: submitted.updatedAt },
        { actorUserId: knowledgeBaseTestIds.adminIt },
      ),
    ).rejects.toMatchObject({ response: { code: 'STALE_WRITE' } });
    expect(
      (await harness.articles.getById(created.id, {
        actorUserId: knowledgeBaseTestIds.agentIt,
      })).status,
    ).toBe('IN_REVIEW');
  });

  it('binds the review to the content that was approved', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    const created = await draftWithReviewer(harness);
    await harness.workflow.submitReview(
      created.id,
      { reason: 'submit' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    const approved = await harness.workflow.approveReview(
      created.id,
      { reason: 'approve' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    expect(approved.lastReviewedAt).not.toBeNull();

    // The owner rewrites the text after the approval: the review no longer
    // covers the published content, so publishing must be refused.
    const edited = await harness.articles.update(
      created.id,
      { body: 'Nova uputa koju reviewer nije vidio.', reason: 'edit after review' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    expect(edited.lastReviewedAt).toBeNull();
    expect(edited.status).toBe('IN_REVIEW');

    await expect(
      harness.workflow.publish(
        created.id,
        { reason: 'publish unreviewed text' },
        { actorUserId: knowledgeBaseTestIds.adminIt },
      ),
    ).rejects.toMatchObject({ response: { code: 'PUBLISH_REVIEW_REQUIRED' } });

    // Re-approving the new revision re-enables publishing.
    await harness.workflow.approveReview(
      created.id,
      { reason: 'approve new text' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    const published = await harness.workflow.publish(
      created.id,
      { reason: 'publish reviewed text' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    expect(published.status).toBe('PUBLISHED');
  });

  it('retries the next slug suffix when a concurrent create wins the race', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    const first = await harness.articles.create(vpnArticleInput(), {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    expect(first.slug).toBe('reset-vpn-password');

    const delegate = harness.memory.prisma.knowledgeArticle;
    const originalCreate = delegate.create;
    let insertAttempts = 0;
    jest
      .spyOn(delegate, 'create')
      .mockImplementation(async (args: Parameters<typeof originalCreate>[0]) => {
        insertAttempts += 1;
        if (insertAttempts === 1) {
          // Another request inserted the slug first, then this one lost the race.
          await originalCreate(args);
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }
        return originalCreate(args);
      });

    const created = await harness.articles.create(vpnArticleInput(), {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    expect(insertAttempts).toBe(2);
    expect(created.slug).toBe('reset-vpn-password-3');
  });

  it('keeps the review when only metadata changes', async () => {
    const harness = createKnowledgeBaseServiceHarness();
    const created = await draftWithReviewer(harness);
    await harness.workflow.submitReview(
      created.id,
      { reason: 'submit' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    const approved = await harness.workflow.approveReview(
      created.id,
      { reason: 'approve' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );

    const renamedOwner = await harness.articles.update(
      created.id,
      {
        reviewerUserId: knowledgeBaseTestIds.reviewerUser,
        reason: 'reassign reviewer',
      },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    expect(renamedOwner.lastReviewedAt).toBe(approved.lastReviewedAt);
  });
});
