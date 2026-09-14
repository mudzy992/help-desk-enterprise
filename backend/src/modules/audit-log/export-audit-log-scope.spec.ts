import {
  isAuditLogVisibleInOrganizationalUnitScope,
  selectOrganizationalUnitIdsInScope,
} from './select-organizational-unit-ids-in-scope';

describe('audit export organizational unit scoping', () => {
  const units = [
    { id: 'ou-root', ouPath: '/Korisnici' },
    { id: 'ou-it', ouPath: '/Korisnici/IT' },
    { id: 'ou-it-ops', ouPath: '/Korisnici/IT/Ops' },
    { id: 'ou-hr', ouPath: '/Korisnici/HR' },
  ];

  it('includes the requested unit and descendants only', () => {
    expect(selectOrganizationalUnitIdsInScope(units, '/Korisnici/IT')).toEqual([
      'ou-it',
      'ou-it-ops',
    ]);
  });

  it('hides sibling OU records from Admin and shows global records only to SuperAdmin', () => {
    const scoped = selectOrganizationalUnitIdsInScope(units, '/Korisnici/IT');
    expect(
      isAuditLogVisibleInOrganizationalUnitScope({
        recordOrganizationalUnitId: 'ou-hr',
        scopedOrganizationalUnitIds: scoped,
        includeGlobalRecords: false,
      }),
    ).toBe(false);
    expect(
      isAuditLogVisibleInOrganizationalUnitScope({
        recordOrganizationalUnitId: 'ou-it-ops',
        scopedOrganizationalUnitIds: scoped,
        includeGlobalRecords: false,
      }),
    ).toBe(true);
    expect(
      isAuditLogVisibleInOrganizationalUnitScope({
        recordOrganizationalUnitId: null,
        scopedOrganizationalUnitIds: scoped,
        includeGlobalRecords: false,
      }),
    ).toBe(false);
    expect(
      isAuditLogVisibleInOrganizationalUnitScope({
        recordOrganizationalUnitId: null,
        scopedOrganizationalUnitIds: scoped,
        includeGlobalRecords: true,
      }),
    ).toBe(true);
  });
});
