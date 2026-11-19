import { knowledgeBaseConstants } from './knowledge-base.constants';
import { KnowledgeBaseError } from './knowledge-base.error';

/**
 * W7.52 (BA-knowledge-base-04): opaque pagination tokens.
 *
 * The console list is ordered by `(updatedAt desc, id asc)`, so its cursor is a
 * keyset position — resuming right after the last returned row instead of
 * re-reading everything before it. Full-text search is ordered by rank, which
 * has no stable keyset, so that path pages by offset and is capped at
 * `maximumSearchOffset`.
 */
export type KnowledgeArticleKeysetCursor = {
  readonly kind: 'keyset';
  readonly updatedAt: Date;
  readonly id: string;
};

export type KnowledgeArticleOffsetCursor = {
  readonly kind: 'offset';
  readonly offset: number;
};

export type KnowledgeArticleCursor =
  | KnowledgeArticleKeysetCursor
  | KnowledgeArticleOffsetCursor;

export function keysetCursorOf(article: {
  readonly updatedAt: Date;
  readonly id: string;
}): KnowledgeArticleCursor {
  return { kind: 'keyset', updatedAt: article.updatedAt, id: article.id };
}

export function encodeKnowledgeArticleCursor(
  cursor: KnowledgeArticleCursor,
): string {
  const payload =
    cursor.kind === 'keyset'
      ? { k: 'k', u: cursor.updatedAt.toISOString(), i: cursor.id }
      : { k: 'o', o: cursor.offset };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeKnowledgeArticleCursor(
  raw: string | undefined,
): KnowledgeArticleCursor | null {
  if (raw === undefined || raw.length === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new KnowledgeBaseError('INVALID_CURSOR');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new KnowledgeBaseError('INVALID_CURSOR');
  }
  const value = parsed as { k?: unknown; u?: unknown; i?: unknown; o?: unknown };
  if (value.k === 'k' && typeof value.u === 'string' && typeof value.i === 'string') {
    const updatedAt = new Date(value.u);
    if (Number.isNaN(updatedAt.getTime()) || value.i.length === 0) {
      throw new KnowledgeBaseError('INVALID_CURSOR');
    }
    return { kind: 'keyset', updatedAt, id: value.i };
  }
  if (
    value.k === 'o' &&
    typeof value.o === 'number' &&
    Number.isInteger(value.o) &&
    value.o >= 0
  ) {
    if (value.o > knowledgeBaseConstants.maximumSearchOffset) {
      throw new KnowledgeBaseError('INVALID_CURSOR');
    }
    return { kind: 'offset', offset: value.o };
  }
  throw new KnowledgeBaseError('INVALID_CURSOR');
}

/** Clamps a caller-supplied page size into the allowed window. */
export function resolvePageSize(
  requested: number | undefined,
  defaultSize: number = knowledgeBaseConstants.defaultListPageSize,
  maximumSize: number = knowledgeBaseConstants.maximumListPageSize,
): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return defaultSize;
  }
  const rounded = Math.trunc(requested);
  if (rounded < 1) {
    return 1;
  }
  return Math.min(rounded, maximumSize);
}
