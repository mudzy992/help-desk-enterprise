import { buildForwardedFilter } from './build-ticket-list-where';

describe('buildForwardedFilter (package 1.6)', () => {
  const agent = { isSuperAdmin: false, roleKeys: ['AGENT'] };

  it('is empty without the parameter', () => {
    expect(buildForwardedFilter({}, agent, ['g1'])).toEqual([]);
  });

  it('narrows to forwarded tickets, optionally in my groups', () => {
    expect(buildForwardedFilter({ forwarded: 'any' }, agent, ['g1'])).toEqual([
      { forwardCount: { gt: 0 } },
    ]);
    expect(buildForwardedFilter({ forwarded: 'toMyGroups' }, agent, ['g1', 'g2'])).toEqual([
      { forwardCount: { gt: 0 }, assignedGroupId: { in: ['g1', 'g2'] } },
    ]);
  });

  it('is ignored for requesters', () => {
    expect(
      buildForwardedFilter({ forwarded: 'any' }, { isSuperAdmin: false, roleKeys: ['END_USER'] }, []),
    ).toEqual([]);
  });
});
