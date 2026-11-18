import { problemEventMentionSql, problemMentionTokens, problemMentionWhere, problemScrubbableColumns } from './problem-mentions';
import { createTextScrubber } from './text-scrubber';

/*
  W7.34 (BA-problems-16): the problem mention filter must be a superset of what
  the scrubber can replace — otherwise a name in a problem nobody owns would
  never be offered to the scrubber at all.
*/
describe('problem mention selection', () => {
  const identifiers = {
    displayName: 'Amra Hodžić',
    email: 'amra.hodzic@example.com',
    distinguishedName: 'CN=Amra Hodzic,OU=IT,DC=example,DC=ba',
    logins: ['ahodzic'],
  };

  it('collects the same identifiers the scrubber knows', () => {
    expect(problemMentionTokens(identifiers)).toEqual([
      'amra.hodzic@example.com',
      'amra.hodzic',
      'CN=Amra Hodzic,OU=IT,DC=example,DC=ba',
      'ahodzic',
      'Amra Hodžić',
      'Hodžić Amra',
    ]);
  });

  it('skips tokens the scrubber would never replace', () => {
    // A short local part, a short login and a single short first name stay out;
    // the full address is always a token because the scrubber replaces it.
    expect(
      problemMentionTokens({
        displayName: 'Ana',
        email: 'ana@example.com',
        logins: ['ana'],
      }),
    ).toEqual(['ana@example.com']);
  });

  it('filters every scrubbable column, case-insensitively', () => {
    const where = problemMentionWhere(['Amra Hodžić']);
    const or = (where.OR ?? []) as Record<string, unknown>[];
    expect(or).toHaveLength(problemScrubbableColumns.length);
    for (const column of problemScrubbableColumns) {
      expect(or).toContainEqual({ [column]: { contains: 'Amra Hodžić', mode: 'insensitive' } });
    }
  });

  it('never matches when the person has no replaceable token', () => {
    expect(problemMentionWhere([])).toEqual({ id: { in: [] } });
    expect(problemEventMentionSql([]).strings.join('')).toContain('WHERE false');
  });

  it('builds one bounded ILIKE query for event details', () => {
    const sql = problemEventMentionSql(['Amra Hodžić', 'ahodzic']);
    const serialized = JSON.stringify(sql).replace(/\\"/g, '"');
    expect(serialized).toContain('"detail"::text ILIKE');
    expect(serialized).toContain(' OR ');
    expect(serialized).toContain('%Amra Hodžić%');
    expect(serialized).toContain('%ahodzic%');
  });

  it('the scrubber exposes the identifiers the filter is derived from', () => {
    const scrubber = createTextScrubber(identifiers, 'Bivši korisnik #AAAA');
    expect(scrubber.identifiers.displayName).toBe('Amra Hodžić');
    // Both directions agree: a token below the threshold is not replaced either.
    expect(scrubber.scrub('kontakt: ahodzic').count).toBe(1);
    expect(problemMentionTokens(scrubber.identifiers)).toContain('ahodzic');
  });
});
