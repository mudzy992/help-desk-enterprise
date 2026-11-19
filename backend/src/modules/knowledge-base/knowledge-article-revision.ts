import { KnowledgeBaseError } from './knowledge-base.error';

/**
 * W7.51 (BA-knowledge-base-03): optimistic concurrency for knowledge articles.
 *
 * The row timestamp is a stable token: Prisma refreshes `updatedAt` on every
 * write, so an `If-Match` value taken from one read is rejected as soon as any
 * other writer commits. The transactional state predicate in
 * `persistStatusChange`/`updateKnowledgeArticle` repeats the same comparison in
 * the `WHERE` clause, so a race that happens between the read and the write
 * also fails instead of overwriting.
 */
export function knowledgeArticleRevisionOf(article: {
  readonly updatedAt: Date;
}): string {
  return article.updatedAt.toISOString();
}

/** Accepts a bare token or a quoted/weak `If-Match` value. */
export function normalizeKnowledgeArticleRevision(
  value: string | undefined,
): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value
    .trim()
    .replace(/^W\//iu, '')
    .replace(/^"+|"+$/gu, '')
    .trim();
  return normalized.length === 0 ? null : normalized;
}

export function assertKnowledgeArticleRevision(
  article: { readonly updatedAt: Date },
  expected: string | undefined,
): void {
  const expectedRevision = normalizeKnowledgeArticleRevision(expected);
  if (expectedRevision === null) {
    return;
  }
  if (expectedRevision !== knowledgeArticleRevisionOf(article)) {
    throw new KnowledgeBaseError('STALE_WRITE');
  }
}
