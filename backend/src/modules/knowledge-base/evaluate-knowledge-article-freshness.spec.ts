import { evaluateKnowledgeArticleFreshness } from './evaluate-knowledge-article-freshness';
import { defaultKnowledgeBaseConfiguration } from './knowledge-base.constants';
import { publishedArticleSeed } from './published-article-seed';

describe('evaluateKnowledgeArticleFreshness', () => {
  it('marks a published article stale after the review due date', () => {
    const article = publishedArticleSeed({
      reviewDueAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(
      evaluateKnowledgeArticleFreshness(
        article,
        defaultKnowledgeBaseConfiguration,
        new Date('2026-09-11T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('does not mark drafts stale', () => {
    const article = publishedArticleSeed({
      status: 'DRAFT',
      reviewDueAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(
      evaluateKnowledgeArticleFreshness(
        article,
        defaultKnowledgeBaseConfiguration,
        new Date('2026-09-11T00:00:00.000Z'),
      ),
    ).toBe(false);
  });
});
