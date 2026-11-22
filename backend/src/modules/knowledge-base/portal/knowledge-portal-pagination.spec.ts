import {
  decodeKnowledgeCategoryCursor,
  decodeKnowledgeCommentCursor,
  encodeKnowledgeCategoryCursor,
  encodeKnowledgeCommentCursor,
} from './knowledge-portal-pagination';

/**
 * W7.90 (`BA-knowledge-base-17`): the two portal cursors are opaque, but they are not secret — they are
 * keyset positions. These tests pin the three things that matter: a round trip keeps the position exactly,
 * no cursor means "first page", and anything unreadable is a caller error rather than a silent empty page.
 */
describe('knowledge portal pagination cursors (W7.90, BA-knowledge-base-17)', () => {
  it('round-trips a comment position', () => {
    const createdAt = new Date('2026-11-18T09:15:00.000Z');
    const encoded = encodeKnowledgeCommentCursor({ createdAt, id: 'fb-42' });
    expect(decodeKnowledgeCommentCursor(encoded)).toEqual({ createdAt, id: 'fb-42' });
  });

  it('round-trips a category-root position including its tiebreakers', () => {
    const encoded = encodeKnowledgeCategoryCursor({ sortOrder: 7, nameBs: 'Mreža', id: 'cat-7' });
    expect(decodeKnowledgeCategoryCursor(encoded)).toEqual({
      sortOrder: 7,
      nameBs: 'Mreža',
      id: 'cat-7',
    });
  });

  it('treats an absent cursor as the first page', () => {
    expect(decodeKnowledgeCommentCursor(undefined)).toBeNull();
    expect(decodeKnowledgeCommentCursor('')).toBeNull();
    expect(decodeKnowledgeCategoryCursor(undefined)).toBeNull();
    expect(decodeKnowledgeCategoryCursor('')).toBeNull();
  });

  it('refuses a cursor it cannot read instead of pretending the page ended', () => {
    const garbage = Buffer.from('not json', 'utf8').toString('base64url');
    const wrongShape = Buffer.from(JSON.stringify({ t: 'yesterday', i: 'x' }), 'utf8').toString('base64url');
    const missingId = Buffer.from(JSON.stringify({ t: '2026-11-18T09:15:00.000Z', i: '' }), 'utf8').toString(
      'base64url',
    );
    const wrongCategory = Buffer.from(JSON.stringify({ s: 'first', n: 'Mreža', i: 'cat-1' }), 'utf8').toString(
      'base64url',
    );
    const codeOf = (run: () => unknown): string => {
      try {
        run();
      } catch (error) {
        return (error as { code?: string }).code ?? 'not-a-domain-error';
      }
      return 'accepted';
    };
    for (const raw of [garbage, wrongShape, missingId]) {
      expect(codeOf(() => decodeKnowledgeCommentCursor(raw))).toBe('INVALID_CURSOR');
    }
    expect(codeOf(() => decodeKnowledgeCategoryCursor(garbage))).toBe('INVALID_CURSOR');
    expect(codeOf(() => decodeKnowledgeCategoryCursor(wrongCategory))).toBe('INVALID_CURSOR');
  });
});
