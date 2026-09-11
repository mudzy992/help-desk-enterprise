import { rankKnowledgeArticles } from './rank-knowledge-articles';

describe('rankKnowledgeArticles', () => {
  const vpn = {
    id: 'a-vpn',
    title: 'Reset VPN password',
    body: 'Self-service portal steps',
    publishedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
  const wifi = {
    id: 'a-wifi',
    title: 'Office wifi',
    body: 'Connect to the corporate wireless network',
    publishedAt: new Date('2026-09-10T00:00:00.000Z'),
  };

  it('ranks text matches above unrelated articles and is deterministic', () => {
    const ranked = rankKnowledgeArticles({
      articles: [wifi, vpn],
      query: 'vpn password',
      feedbackByArticleId: new Map(),
      useFeedbackWeight: true,
    });
    expect(ranked.map((item) => item.id)).toEqual(['a-vpn', 'a-wifi']);
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it('raises rank when helpful feedback outweighs not-helpful', () => {
    const withoutFeedback = rankKnowledgeArticles({
      articles: [wifi, vpn],
      query: '',
      feedbackByArticleId: new Map(),
      useFeedbackWeight: true,
    });
    expect(withoutFeedback.map((item) => item.id)).toEqual(['a-wifi', 'a-vpn']);
    const withFeedback = rankKnowledgeArticles({
      articles: [wifi, vpn],
      query: '',
      feedbackByArticleId: new Map([
        ['a-vpn', { helpfulCount: 4, notHelpfulCount: 0 }],
        ['a-wifi', { helpfulCount: 0, notHelpfulCount: 1 }],
      ]),
      useFeedbackWeight: true,
    });
    expect(withFeedback.map((item) => item.id)).toEqual(['a-vpn', 'a-wifi']);
  });

  it('ignores feedback when ranking weight is disabled', () => {
    const ranked = rankKnowledgeArticles({
      articles: [wifi, vpn],
      query: '',
      feedbackByArticleId: new Map([
        ['a-vpn', { helpfulCount: 8, notHelpfulCount: 0 }],
      ]),
      useFeedbackWeight: false,
    });
    expect(ranked.map((item) => item.id)).toEqual(['a-wifi', 'a-vpn']);
    expect(ranked[0]?.score).toBe(0);
    expect(ranked[1]?.score).toBe(0);
  });
});
