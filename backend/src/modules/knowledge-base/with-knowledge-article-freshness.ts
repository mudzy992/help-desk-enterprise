import {
  evaluateKnowledgeArticleFreshness,
} from './evaluate-knowledge-article-freshness';
import type {
  KnowledgeArticleRecord,
  KnowledgeBaseConfiguration,
} from './knowledge-base.types';

export function withKnowledgeArticleFreshness(
  article: KnowledgeArticleRecord,
  configuration: KnowledgeBaseConfiguration,
  now: Date,
): KnowledgeArticleRecord {
  return {
    ...article,
    isStale: evaluateKnowledgeArticleFreshness(article, configuration, now),
  };
}
