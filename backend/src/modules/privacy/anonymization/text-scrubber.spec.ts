import { createTextScrubber, nameVariants, replacementExample } from './text-scrubber';
import { computeTombstones, readTombstoneKey } from './tombstones';
import { createPseudonym } from './pseudonym';

const P = 'Bivši korisnik #7F3A';
const scrubber = createTextScrubber(
  {
    displayName: 'Amra Hodžić',
    email: 'amra.hodzic@example.com',
    distinguishedName: 'CN=Amra Hodžić,OU=IT,DC=example,DC=com',
    logins: ['ahodzic'],
  },
  P,
);

describe('text scrubber (paket 2.6 §6.3)', () => {
  it('replaces full name, reversed name, e-mail, local part, DN and login', () => {
    const input =
      'Pozdrav, Amra Hodžić (amra.hodzic@example.com). HODŽIĆ AMRA je javila; login EPBIH\\ahodzic, lokalno amra.hodzic. DN: CN=Amra Hodžić,OU=IT,DC=example,DC=com';
    const { text, count } = scrubber.scrub(input);
    expect(text).not.toMatch(/amra|hodžić|hodzic|ahodzic/i);
    expect(count).toBe(6);
  });

  it('respects word boundaries and never replaces the first name alone', () => {
    expect(scrubber.scrub('Amra je rekla da Amra Hodžićka nije ista osoba.').count).toBe(0);
    expect(scrubber.scrub('xamra.hodzic@example.com.org').count).toBe(0);
    expect(nameVariants('Amra')).toEqual([]);
    // Longer addresses / logins that merely start with the identifier stay.
    expect(scrubber.scrub('amra.hodzic@example.comx i amra.hodzicka i ahodzicx').count).toBe(0);
    expect(scrubber.scrub('Piši na amra.hodzic@example.com.').count).toBe(1);
  });

  it('handles decomposed diacritics (NFC) and multiple spaces', () => {
    expect(scrubber.scrub('Amra   Hodz\u030Cic\u0301').count).toBe(1);
  });

  it('replaces inside mention tokens and JSON strings, keys untouched', () => {
    expect(scrubber.scrub('@[Amra Hodžić](u1) pogledaj').text).toBe(`@[${P}](u1) pogledaj`);
    const { value, count } = scrubber.scrubJson({ requester: { name: 'Amra Hodžić', n: 3 }, list: ['amra.hodzic@example.com'] });
    expect(value).toEqual({ requester: { name: P, n: 3 }, list: [P] });
    expect(count).toBe(2);
  });

  it('returns the original reference when nothing matched', () => {
    const input = { a: 'x' };
    expect(scrubber.scrubJson(input).value).toBe(input);
  });

  it('builds a short example that contains only the pseudonym', () => {
    const { text } = scrubber.scrub(`${'a'.repeat(50)} Amra Hodžić ${'b'.repeat(50)}`);
    const example = replacementExample(text, P)!;
    expect(example).toContain(P);
    expect(example.startsWith('…')).toBe(true);
    expect(example.endsWith('…')).toBe(true);
  });
});

describe('pseudonym and tombstones (§6.4)', () => {
  it('pseudonym is random and undeliverable', () => {
    const first = createPseudonym();
    expect(first.displayName).toMatch(/^Bivši korisnik #[0-9A-F]{4}$/);
    expect(first.email).toMatch(/^anon-[0-9a-f]{12}@anonymized\.invalid$/);
    expect(createPseudonym(3).tag).toHaveLength(6);
  });

  it('tombstones are keyed, normalised HMACs', () => {
    const key = readTombstoneKey({ PRIVACY_TOMBSTONE_KEY: 'x'.repeat(32) } as never)!;
    const a = computeTombstones(key, { email: ' Amra@example.com ', directoryObjectGuid: 'ABC', entraObjectId: null });
    const b = computeTombstones(key, { email: 'amra@example.com', directoryObjectGuid: 'abc' });
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    expect(a[0]).not.toContain('amra');
    expect(readTombstoneKey({} as never)).toBeNull();
  });
});
