import { knowledgeBaseConstants } from './knowledge-base.constants';
import { KnowledgeBaseError } from './knowledge-base.error';

export function normalizeKnowledgeArticleTitle(value: string): string {
  const title = value.trim();
  if (
    title.length === 0 ||
    title.length > knowledgeBaseConstants.maximumTitleLength
  ) {
    throw new KnowledgeBaseError('INVALID_TITLE');
  }
  return title;
}

export function normalizeKnowledgeArticleBody(value: string): string {
  const body = value.trim();
  if (body.length === 0 || body.length > knowledgeBaseConstants.maximumBodyLength) {
    throw new KnowledgeBaseError('INVALID_BODY');
  }
  return body;
}

export function normalizeKnowledgeInterceptQuery(value: string | undefined): string {
  const query = value?.trim() ?? '';
  if (query.length > knowledgeBaseConstants.maximumQueryLength) {
    return query.slice(0, knowledgeBaseConstants.maximumQueryLength);
  }
  return query;
}
