import { maxMentionsPerMessage, parseMentionTokens, rewriteMentionTokens } from './parse-mention-tokens';

describe('parseMentionTokens (Paket 2.4 B3)', () => {
  it('reads distinct tokens in order and ignores plain @text', () => {
    const body = 'Hej @[Amra Hodžić](cm1user0001) i @[Edin](cm1user0002), @ivan pogledaj; opet @[Amra Hodžić](cm1user0001)';
    expect(parseMentionTokens(body)).toEqual([
      { userId: 'cm1user0001', name: 'Amra Hodžić' },
      { userId: 'cm1user0002', name: 'Edin' },
    ]);
  });

  it(`honours at most ${maxMentionsPerMessage} users`, () => {
    const body = Array.from({ length: 12 }, (_, index) => `@[U${index}](user-id-${String(index).padStart(4, '0')})`).join(' ');
    expect(parseMentionTokens(body)).toHaveLength(maxMentionsPerMessage);
  });

  it('turns tokens of users not kept into plain @Name', () => {
    const body = '@[Amra](cm1user0001) @[Lažni](fakeuser99)';
    expect(rewriteMentionTokens(body, new Set(['cm1user0001']))).toBe('@[Amra](cm1user0001) @Lažni');
  });
});
