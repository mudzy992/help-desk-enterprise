import { OrganizationalUnitType } from '../../generated/prisma/enums';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import {
  defaultManualDirectoryOrganizationalUnitType,
  parseManualDirectoryOrganizationalUnitType,
} from './parse-manual-directory-organizational-unit-type';

describe('parseManualDirectoryOrganizationalUnitType', () => {
  it('defaults by parent presence and accepts enum values', () => {
    expect(defaultManualDirectoryOrganizationalUnitType(null)).toBe(
      OrganizationalUnitType.DIRECTORATE,
    );
    expect(defaultManualDirectoryOrganizationalUnitType('parent')).toBe(
      OrganizationalUnitType.BRANCH,
    );
    expect(
      parseManualDirectoryOrganizationalUnitType(
        'OFFICE',
        OrganizationalUnitType.BRANCH,
      ),
    ).toBe(OrganizationalUnitType.OFFICE);
  });

  it('rejects unknown types', () => {
    expect(() =>
      parseManualDirectoryOrganizationalUnitType(
        'CAMPUS',
        OrganizationalUnitType.BRANCH,
      ),
    ).toThrow(ManualDirectoryCatalogError);
  });
});
