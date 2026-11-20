import {
  changeEventMentionSql,
  changeMentionTokens,
  changeMentionWhere,
  changeScrubbableColumns,
  downtimeWindowMentionWhere,
} from './change-mentions';
import { mentionTokens } from './mention-tokens';
import { createTextScrubber } from './text-scrubber';

/*
  BA-changes-17: the change selection must be a superset of what the scrubber
  can replace. Before this the anonymisation only looked at requester and owner,
  so a colleague named in somebody else's implementation plan was never even
  offered to the scrubber. The calendar window the change copies into the
  service catalogue is a replica of the title, so it is selected the same way.
*/
describe('change mention selection', () => {
  const identifiers = {
    displayName: 'Amra Hodžić',
    email: 'amra.hodzic@example.com',
    distinguishedName: 'CN=Amra Hodzic,OU=IT,DC=example,DC=ba',
    logins: ['ahodzic'],
  };

  it('collects the same identifiers the problems use', () => {
    // One shared helper, so the two modules cannot drift apart.
    expect(changeMentionTokens(identifiers)).toEqual(mentionTokens(identifiers));
    expect(changeMentionTokens(identifiers)).toEqual([
      'amra.hodzic@example.com',
      'amra.hodzic',
      'CN=Amra Hodzic,OU=IT,DC=example,DC=ba',
      'ahodzic',
      'Amra Hodžić',
      'Hodžić Amra',
    ]);
  });

  it('covers every free-text column of a change', () => {
    // `outcome` is an enum and `title` is bounded, so these nine are the whole
    // set a name can hide in.
    expect([...changeScrubbableColumns]).toEqual([
      'title',
      'description',
      'reason',
      'implementationPlan',
      'backoutPlan',
      'testPlan',
      'communicationPlan',
      'reviewNotes',
      'cancelReason',
    ]);
  });

  it('filters every scrubbable column, case-insensitively', () => {
    const where = changeMentionWhere(['Amra Hodžić']);
    const or = (where.OR ?? []) as Record<string, unknown>[];
    expect(or).toHaveLength(changeScrubbableColumns.length);
    for (const column of changeScrubbableColumns) {
      expect(or).toContainEqual({ [column]: { contains: 'Amra Hodžić', mode: 'insensitive' } });
    }
  });

  it('never matches when the person has no replaceable token', () => {
    expect(changeMentionWhere([])).toEqual({ id: { in: [] } });
    expect(JSON.stringify(changeEventMentionSql([]))).toContain('WHERE false');
    expect(downtimeWindowMentionWhere([])).toEqual({ id: { in: [] } });
  });

  it('builds one bounded ILIKE query for event details', () => {
    const sql = changeEventMentionSql(['Amra Hodžić', 'ahodzic']);
    const serialized = JSON.stringify(sql).replace(/\\"/g, '"');
    expect(serialized).toContain('"detail"::text ILIKE');
    expect(serialized).toContain(' OR ');
    expect(serialized).toContain('%Amra Hodžić%');
    expect(serialized).toContain('%ahodzic%');
  });

  it('searches the calendar window that copies `number · title`', () => {
    // The downtime sync writes the change number and title into the service
    // catalogue; scrubbing only the change would leave the name in the calendar.
    expect(downtimeWindowMentionWhere(['Amra Hodžić'])).toEqual({
      OR: [{ message: { contains: 'Amra Hodžić', mode: 'insensitive' } }],
    });
    expect(downtimeWindowMentionWhere(['Amra Hodžić', 'ahodzic']).OR).toHaveLength(2);
  });

  it('agrees with the scrubber on what can be replaced', () => {
    const scrubber = createTextScrubber(identifiers, 'Bivši korisnik #AAAA');
    const tokens = changeMentionTokens(scrubber.identifiers);
    // Both directions: a token below the threshold is neither searched nor
    // replaced, and every replaced string came from a token.
    expect(tokens).toContain('ahodzic');
    expect(scrubber.scrub('kontakt: ahodzic').count).toBe(1);
    const belowThreshold = changeMentionTokens({ displayName: 'Ana', email: 'ana@example.com', logins: ['ana'] });
    expect(belowThreshold).toEqual(['ana@example.com']);
    expect(createTextScrubber({ displayName: 'Ana', email: 'ana@example.com', logins: ['ana'] }, 'X').scrub('ana').count).toBe(0);
  });
});
