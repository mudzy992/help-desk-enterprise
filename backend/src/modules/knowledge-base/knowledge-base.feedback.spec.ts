import {
  createKnowledgeBaseServiceHarness,
  knowledgeBaseTestIds,
} from './create-knowledge-base-service-harness';
import { publishedArticleSeed } from './published-article-seed';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('Knowledge feedback', () => {
  it('persists a vote and upserts the current vote for the same user', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'vpn-reset' }));
    const first = await discovery.submitFeedback(
      'vpn-reset',
      { isHelpful: true },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(first.isHelpful).toBe(true);
    const second = await discovery.submitFeedback(
      'vpn-reset',
      { isHelpful: false },
      { actorUserId: knowledgeBaseTestIds.requester },
    );
    expect(second.isHelpful).toBe(false);
    expect(memory.feedbacks.size).toBe(1);
  });

  it('keeps an earlier 1-5 rating and its comment when a thumbs vote follows', async () => {
    const { discovery, memory } = createKnowledgeBaseServiceHarness();
    memory.seedArticle(publishedArticleSeed({ id: 'vpn-reset' }));
    const actor = { actorUserId: knowledgeBaseTestIds.requester };
    await discovery.submitFeedback('vpn-reset', { rating: 2, comment: 'Nedostaje korak za macOS' }, actor);
    const thumbs = await discovery.submitFeedback('vpn-reset', { isHelpful: true }, actor);
    expect(thumbs.isHelpful).toBe(true);
    expect(thumbs.rating).toBe(2);
    const [stored] = [...memory.feedbacks.values()];
    expect(stored).toMatchObject({ rating: 2, comment: 'Nedostaje korak za macOS', isHelpful: true });
    expect(memory.feedbacks.size).toBe(1);
  });

  it('rejects feedback on unauthorized articles and when feedback is disabled', async () => {
    const { discovery, memory, configuration } =
      createKnowledgeBaseServiceHarness();
    memory.seedArticle(
      publishedArticleSeed({
        id: 'secret',
        classification: 'CONFIDENTIAL',
      }),
    );
    await expect(
      discovery.submitFeedback(
        'secret',
        { isHelpful: true },
        { actorUserId: knowledgeBaseTestIds.requester },
      ),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    memory.seedArticle(publishedArticleSeed({ id: 'public-vpn' }));
    configuration.feedbackEnabled = false;
    await expect(
      discovery.submitFeedback(
        'public-vpn',
        { isHelpful: true },
        { actorUserId: knowledgeBaseTestIds.requester },
      ),
    ).rejects.toMatchObject({ response: { code: 'FEEDBACK_DISABLED' } });
  });
});
