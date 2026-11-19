import {
  countSearchQueryCharacters,
  isUsableSearchQuery,
  normalizeSearchQuery,
} from './normalize-search-query';
import { searchConstants } from './search.constants';

/*
  W7.56 (BA-search-02): the audit proved the length gate ran on the raw string,
  so `%20%20` and `%20a` reached the query as an empty / one-character needle.
  The tests below pin every way a query can look long enough while carrying
  no content.
*/
describe('search query normalization', () => {
  it('trims Unicode whitespace, not only ASCII spaces', () => {
    expect(normalizeSearchQuery('  vpn  ')).toBe('vpn');
    expect(normalizeSearchQuery('\u00a0vpn\u00a0')).toBe('vpn'); // NBSP
    expect(normalizeSearchQuery('\u3000vpn\u3000')).toBe('vpn'); // ideographic
    expect(normalizeSearchQuery('\n\tvpn\r\n')).toBe('vpn');
    expect(normalizeSearchQuery('\u2028vpn\u2029')).toBe('vpn');
  });

  it('collapses inner whitespace so one needle has one shape', () => {
    expect(normalizeSearchQuery('vpn   pristup')).toBe('vpn pristup');
    expect(normalizeSearchQuery('vpn\u00a0\u2003pristup')).toBe('vpn pristup');
  });

  it('removes zero-width and bidi characters instead of counting them', () => {
    expect(normalizeSearchQuery('\u200b\u200ba')).toBe('a');
    expect(normalizeSearchQuery('v\u200dpn')).toBe('vpn'); // ZWJ
    expect(normalizeSearchQuery('vpn\u200f')).toBe('vpn'); // RLM
    expect(normalizeSearchQuery('\ufeffvpn\ufeff')).toBe('vpn'); // BOM
    expect(normalizeSearchQuery('\u200b\u200b')).toBe('');
  });

  it('applies NFKC so visually equal queries are one query', () => {
    expect(normalizeSearchQuery('ﬁle')).toBe('file'); // ligature
    expect(normalizeSearchQuery('ＶＰＮ')).toBe('VPN'); // fullwidth
    expect(normalizeSearchQuery('e\u0301')).toBe('\u00e9'); // decomposed é
    expect(countSearchQueryCharacters(normalizeSearchQuery('e\u0301'))).toBe(1);
  });

  it('turns control characters into a space', () => {
    expect(normalizeSearchQuery('vpn\u0000pristup')).toBe('vpn pristup');
    expect(normalizeSearchQuery('vpn\u007f')).toBe('vpn');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(countSearchQueryCharacters('')).toBe(0);
    expect(countSearchQueryCharacters('a')).toBe(1);
    expect(countSearchQueryCharacters('👍')).toBe(1);
    expect(countSearchQueryCharacters('👍👍')).toBe(2);
    expect(countSearchQueryCharacters('é')).toBe(1);
  });

  it('accepts only queries with two characters of content', () => {
    expect(isUsableSearchQuery('')).toBe(false);
    expect(isUsableSearchQuery(' ')).toBe(false);
    expect(isUsableSearchQuery('a')).toBe(false);
    expect(isUsableSearchQuery('👍')).toBe(false);
    expect(isUsableSearchQuery('ab')).toBe(true);
    expect(isUsableSearchQuery('👍👍')).toBe(true);
  });

  it('bounds the length after normalization, because NFKC can expand it', () => {
    const ligatures = 'ﬁ'.repeat(searchConstants.maximumQueryLength / 2 + 1);
    // 101 UTF-16 units (the old gate accepted it) become 202 characters.
    expect(ligatures).toHaveLength(101);
    expect(isUsableSearchQuery(normalizeSearchQuery(ligatures))).toBe(false);

    const atCeiling = 'a'.repeat(searchConstants.maximumQueryLength);
    expect(isUsableSearchQuery(atCeiling)).toBe(true);
    expect(isUsableSearchQuery(`${atCeiling}a`)).toBe(false);
  });

  it('is idempotent', () => {
    const once = normalizeSearchQuery('  ＶＰＮ\u200b  pristup \u00a0');
    expect(normalizeSearchQuery(once)).toBe(once);
    expect(once).toBe('VPN pristup');
  });
});
