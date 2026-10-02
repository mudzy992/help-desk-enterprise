import { doesOrganizationalUnitScopeCover } from './does-organizational-unit-scope-cover';

describe('doesOrganizationalUnitScopeCover', () => {
  it('allows the assigned unit and its descendants', () => {
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/Podružnica Zenica',
        requestedPath: '/Korisnici/Podružnica Zenica',
      }),
    ).toBe(true);
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/Podružnica Zenica',
        requestedPath: '/Korisnici/Podružnica Zenica/Breza',
      }),
    ).toBe(true);
  });

  it('denies ancestors, siblings, and prefix collisions', () => {
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/Podružnica Zenica',
        requestedPath: '/Korisnici',
      }),
    ).toBe(false);
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/Podružnica Zenica',
        requestedPath: '/Korisnici/Podružnica Sarajevo',
      }),
    ).toBe(false);
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici/Podružnica',
        requestedPath: '/Korisnici/Podružnica Zenica',
      }),
    ).toBe(false);
  });

  it('intentionally denies access when assignedPath is null (no OU wildcard)', () => {
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: null,
        requestedPath: '/Korisnici',
      }),
    ).toBe(false);
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: null,
        requestedPath: null,
      }),
    ).toBe(false);
  });

  it('fails closed for blank requested paths', () => {
    expect(
      doesOrganizationalUnitScopeCover({
        assignedPath: '/Korisnici',
        requestedPath: '   ',
      }),
    ).toBe(false);
  });
});
