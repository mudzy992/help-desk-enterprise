import {
  describeReportScheduleScopeProblem,
  isGroupWithinUnitSubtree,
} from './report-schedule-scope';

/**
 * W7.93 (`BA-reports-03`): a schedule's group filter has to live inside the schedule's own unit subtree.
 * These are the boundaries that mattered to the audit — parent, sibling, deeper descendant and a group
 * whose unit path cannot be read at all.
 */
describe('report schedule group scope (BA-reports-03)', () => {
  const scope = '/Korisnici/IT';

  it('accepts a group of the same unit and of any descendant', () => {
    expect(isGroupWithinUnitSubtree({ scopeUnitPath: scope, groupUnitPath: '/Korisnici/IT' })).toBe(
      true,
    );
    expect(
      isGroupWithinUnitSubtree({
        scopeUnitPath: scope,
        groupUnitPath: '/Korisnici/IT/ServiceDesk',
      }),
    ).toBe(true);
    expect(
      isGroupWithinUnitSubtree({
        scopeUnitPath: scope,
        groupUnitPath: '/Korisnici/IT/ServiceDesk/L1',
      }),
    ).toBe(true);
  });

  it('refuses a parent, a sibling branch and a prefix that is only a string prefix', () => {
    expect(isGroupWithinUnitSubtree({ scopeUnitPath: scope, groupUnitPath: '/Korisnici' })).toBe(
      false,
    );
    expect(isGroupWithinUnitSubtree({ scopeUnitPath: scope, groupUnitPath: '/Korisnici/HR' })).toBe(
      false,
    );
    // `/Korisnici/ITX` starts with `/Korisnici/IT` as text but is not below it.
    expect(
      isGroupWithinUnitSubtree({ scopeUnitPath: scope, groupUnitPath: '/Korisnici/ITX' }),
    ).toBe(false);
  });

  it('refuses a blank or missing path on either side', () => {
    expect(isGroupWithinUnitSubtree({ scopeUnitPath: null, groupUnitPath: scope })).toBe(false);
    expect(isGroupWithinUnitSubtree({ scopeUnitPath: scope, groupUnitPath: null })).toBe(false);
    expect(isGroupWithinUnitSubtree({ scopeUnitPath: '  ', groupUnitPath: scope })).toBe(false);
  });

  it('reports the field that broke the scope, and nothing when the schedule has no group', () => {
    expect(describeReportScheduleScopeProblem({ group: null, scopeUnitPath: scope })).toBeNull();
    expect(
      describeReportScheduleScopeProblem({
        group: { ouPath: '/Korisnici/IT/ServiceDesk' },
        scopeUnitPath: scope,
      }),
    ).toBeNull();
    expect(
      describeReportScheduleScopeProblem({
        group: { ouPath: '/Korisnici/HR' },
        scopeUnitPath: scope,
      }),
    ).toBe('groupId');
  });
});
