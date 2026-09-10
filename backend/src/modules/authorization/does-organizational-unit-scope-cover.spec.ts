import { doesOrganizationalUnitScopeCover } from './does-organizational-unit-scope-cover';

describe('doesOrganizationalUnitScopeCover', () => {
  it('allows the assigned unit and its descendants', () => {
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/ED Zenica',
        requestedPath: '/Korisnici/ED Zenica',
      }),
    ).toBe(true);
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/ED Zenica',
        requestedPath: '/Korisnici/ED Zenica/Breza',
      }),
    ).toBe(true);
  });

  it('denies ancestors, siblings, and prefix collisions', () => {
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/ED Zenica',
        requestedPath: '/Korisnici',
      }),
    ).toBe(false);
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/ED Zenica',
        requestedPath: '/Korisnici/ED Sarajevo',
      }),
    ).toBe(false);
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/ED',
        requestedPath: '/Korisnici/ED Zenica',
      }),
    ).toBe(false);
  });

  it('fails closed for missing or blank paths', () => {
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: null,
        requestedPath: '/Korisnici',
      }),
    ).toBe(false);
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici',
        requestedPath: '   ',
      }),
    ).toBe(false);
  });
});
