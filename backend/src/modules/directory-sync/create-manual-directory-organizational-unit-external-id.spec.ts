import { createManualDirectoryOrganizationalUnitExternalId } from './create-manual-directory-organizational-unit-external-id';

describe('createManualDirectoryOrganizationalUnitExternalId', () => {
  it('produces distinct ids for sibling units under a long parent path', () => {
    const parent = '/Korisnici/Podružnica Zenica/Sektor podrške';
    const breza = createManualDirectoryOrganizationalUnitExternalId(
      `${parent}/Breza`,
    );
    const visoko = createManualDirectoryOrganizationalUnitExternalId(
      `${parent}/Visoko`,
    );
    const kakanj = createManualDirectoryOrganizationalUnitExternalId(
      `${parent}/Kakanj`,
    );
    expect(breza).not.toBe(visoko);
    expect(visoko).not.toBe(kakanj);
    expect(breza).not.toBe(kakanj);
    expect(breza.startsWith('manual_only:ou:')).toBe(true);
  });

  it('is stable for the same path', () => {
    const path = '/Korisnici/Podružnica Zenica/Sektor podrške/Visoko';
    expect(createManualDirectoryOrganizationalUnitExternalId(path)).toBe(
      createManualDirectoryOrganizationalUnitExternalId(path),
    );
  });
});