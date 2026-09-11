import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { vpnArticleInput } from './vpn-article-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('KnowledgeBase workflow lifecycle', () => {
  it('requires a reviewer before submit and review before publish', async () => {
    const { articles, workflow } = createKnowledgeBaseServiceHarness();
    const withoutReviewer = await articles.create(
      vpnArticleInput({ reviewerUserId: undefined }),
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    await expect(
      workflow.submitReview(
        withoutReviewer.id,
        { reason: 'submit' },
        { actorUserId: knowledgeBaseTestIds.agentIt },
      ),
    ).rejects.toMatchObject({ response: { code: 'REVIEWER_REQUIRED' } });
    const created = await articles.create(vpnArticleInput(), {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    await expect(
      workflow.publish(
        created.id,
        { reason: 'publish too early' },
        { actorUserId: knowledgeBaseTestIds.adminIt },
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });
  });

  it('walks draft → review → reject/approve → publish → archive', async () => {
    const { articles, workflow, memory } = createKnowledgeBaseServiceHarness();
    const created = await articles.create(vpnArticleInput(), {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    const submitted = await workflow.submitReview(
      created.id,
      { reason: 'submit for review' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    expect(submitted.status).toBe('IN_REVIEW');
    const rejected = await workflow.rejectReview(
      created.id,
      { reason: 'needs rewrite' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    expect(rejected.status).toBe('DRAFT');
    await workflow.submitReview(
      created.id,
      { reason: 'submit again' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    await workflow.approveReview(
      created.id,
      { reason: 'approve' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    const published = await workflow.publish(
      created.id,
      { reason: 'publish' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).not.toBeNull();
    expect(published.reviewDueAt).not.toBeNull();
    const archived = await workflow.archive(
      created.id,
      { reason: 'archive obsolete' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    expect(archived.status).toBe('ARCHIVED');
    expect(
      memory.changeLogs.some(
        (entry) =>
          entry.entityType === 'knowledge_article' &&
          entry.entityId === created.id &&
          entry.reason === 'publish',
      ),
    ).toBe(true);
  });

  it('returns a published article to IN_REVIEW when content changes', async () => {
    const { articles, workflow, discovery } = createKnowledgeBaseServiceHarness();
    const created = await articles.create(vpnArticleInput(), {
      actorUserId: knowledgeBaseTestIds.agentIt,
    });
    await workflow.submitReview(
      created.id,
      { reason: 'submit' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    await workflow.approveReview(
      created.id,
      { reason: 'approve' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    await workflow.publish(
      created.id,
      { reason: 'publish' },
      { actorUserId: knowledgeBaseTestIds.adminIt },
    );
    const edited = await articles.update(
      created.id,
      { body: 'Changed published body that needs review.', reason: 'edit live' },
      { actorUserId: knowledgeBaseTestIds.agentIt },
    );
    expect(edited.status).toBe('IN_REVIEW');
    const intercept = await discovery.intercept(
      { serviceId: knowledgeBaseTestIds.serviceVpn, query: 'vpn' },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(intercept.articles.map((item) => item.id)).not.toContain(created.id);
    await expect(
      workflow.publish(
        created.id,
        { reason: 'publish without new review' },
        { actorUserId: knowledgeBaseTestIds.adminIt },
      ),
    ).rejects.toMatchObject({
      response: { code: 'PUBLISH_REVIEW_REQUIRED' },
    });
  });
});
