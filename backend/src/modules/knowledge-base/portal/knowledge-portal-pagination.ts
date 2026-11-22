import { KnowledgeBaseError } from '../knowledge-base.error';

/**
 * W7.90 (`BA-knowledge-base-17`): opaque pagination tokens for the two portal collections that used to be
 * either unbounded (the category tree) or silently cut off (the curator comment feed, first 50 rows).
 *
 * Both are keyset positions, not offsets — the same reasoning as the article list from W7.52: an offset would
 * shift while the curator resolves comments, so a "next page" could repeat or skip a row. A comment is ordered
 * by `(createdAt desc, id desc)`, a category root by `(sortOrder asc, nameBs asc, id asc)`; the cursor carries
 * exactly the columns of that order, so resuming is "everything after this position".
 */

export type KnowledgeCommentCursor = {
  readonly createdAt: Date;
  readonly id: string;
};

export type KnowledgeCategoryCursor = {
  readonly sortOrder: number;
  readonly nameBs: string;
  readonly id: string;
};

export function encodeKnowledgeCommentCursor(cursor: KnowledgeCommentCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.createdAt.toISOString(), i: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeKnowledgeCommentCursor(raw: string | undefined): KnowledgeCommentCursor | null {
  const parsed = readCursor(raw);
  if (parsed === null) {
    return null;
  }
  const value = parsed as { t?: unknown; i?: unknown };
  if (typeof value.t !== 'string' || typeof value.i !== 'string' || value.i.length === 0) {
    throw new KnowledgeBaseError('INVALID_CURSOR');
  }
  const createdAt = new Date(value.t);
  if (Number.isNaN(createdAt.getTime())) {
    throw new KnowledgeBaseError('INVALID_CURSOR');
  }
  return { createdAt, id: value.i };
}

export function encodeKnowledgeCategoryCursor(cursor: KnowledgeCategoryCursor): string {
  return Buffer.from(
    JSON.stringify({ s: cursor.sortOrder, n: cursor.nameBs, i: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeKnowledgeCategoryCursor(raw: string | undefined): KnowledgeCategoryCursor | null {
  const parsed = readCursor(raw);
  if (parsed === null) {
    return null;
  }
  const value = parsed as { s?: unknown; n?: unknown; i?: unknown };
  if (
    typeof value.s !== 'number' ||
    !Number.isInteger(value.s) ||
    typeof value.n !== 'string' ||
    typeof value.i !== 'string' ||
    value.i.length === 0
  ) {
    throw new KnowledgeBaseError('INVALID_CURSOR');
  }
  return { sortOrder: value.s, nameBs: value.n, id: value.i };
}

/** `null` when there is no cursor at all; anything unreadable is a caller error, not an empty page. */
function readCursor(raw: string | undefined): unknown {
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
  return parsed;
}
