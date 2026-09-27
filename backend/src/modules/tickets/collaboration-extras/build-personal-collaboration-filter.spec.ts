import { buildPersonalCollaborationFilter } from '../list/build-ticket-list-where';

describe('buildPersonalCollaborationFilter (Paket 2.4 B6/C5)', () => {
  const now = new Date('2026-10-20T10:00:00Z');

  it('adds nothing without the flags', () => {
    expect(buildPersonalCollaborationFilter({}, 'u1', now)).toEqual([]);
  });

  it('narrows to followed tickets and to mentions of the last 30 days', () => {
    expect(buildPersonalCollaborationFilter({ following: true, mentionedMe: true }, 'u1', now)).toEqual([
      { participants: { some: { userId: 'u1', role: 'FOLLOWER' } } },
      { mentions: { some: { userId: 'u1', createdAt: { gte: new Date('2026-09-20T10:00:00Z') } } } },
    ]);
  });
});
