import { searchConstants } from './search.constants';

/**
 * W7.56 (BA-search-02): one normalization, used by the DTO (before validation)
 * and by the service, so "how long is the query" never depends on where it is
 * asked.
 *
 * The audit found the old contract checked `@MinLength(2)` **before** trimming:
 * `?q=%20%20` and `?q=%20a` passed validation, `toSearchQuery` then trimmed
 * them to an empty or one-character needle, and an empty `contains` matched the
 * newest visible rows of every group. The same gap reappeared with Unicode
 * padding (NBSP, ideographic space, zero-width joiners, a single emoji that is
 * two UTF-16 units but one character).
 *
 * Rules, in this order:
 * 1. `NFKC` — compatibility forms collapse to one shape (`ﬁ` → `fi`, `ＶＰＮ` →
 *    `VPN`, a decomposed `e` + combining acute → `é`), so two visually equal
 *    queries are one query;
 * 2. format/zero-width characters (`U+200B–U+200F`, bidi controls, word joiner,
 *    BOM) are removed — they are not content and must not pad the length;
 * 3. control characters become a space, and every whitespace run becomes one
 *    space, so the needle is stable regardless of how the client typed it;
 * 4. the result is trimmed (leading/trailing Unicode whitespace).
 */
const formatCharacters = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu;
// `\p{Cc}` keeps the intent (C0/C1 controls) without a literal control range.
const controlCharacters = /\p{Cc}/gu;
const whitespaceRun = /\s+/gu;

export function normalizeSearchQuery(value: string): string {
  return value
    .normalize('NFKC')
    .replace(formatCharacters, '')
    .replace(controlCharacters, ' ')
    .replace(whitespaceRun, ' ')
    .trim();
}

/**
 * Characters, not UTF-16 units: one emoji is one character, so "👍" is a
 * one-character query and is refused, while "👍👍" is accepted.
 */
export function countSearchQueryCharacters(value: string): number {
  return [...value].length;
}

/**
 * Whether a (normalized) query is usable: at least `minimumQueryLength` and at
 * most `maximumQueryLength` characters. The ceiling is checked after
 * normalization because NFKC may expand an input (`ﬁ` is two characters).
 */
export function isUsableSearchQuery(value: string): boolean {
  const count = countSearchQueryCharacters(value);
  return (
    count >= searchConstants.minimumQueryLength &&
    count <= searchConstants.maximumQueryLength
  );
}
