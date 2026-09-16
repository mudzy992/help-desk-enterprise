import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import { deleteManualDirectoryOrganizationalUnit } from './delete-manual-directory-organizational-unit';

describe('deleteManualDirectoryOrganizationalUnit', () => {
  it('rejects delete when catalog children exist', async () => {
    const prisma = {
      manualDirectoryOrganizationalUnit: {
        findUnique: async () => ({
          externalId: 'manual_only:ou:users',
          distinguishedName: 'OU=Users,DC=example,DC=com',
          organizationalUnitPath: '/Users',
        }),
        count: async () => 1,
        delete: async () => {
          throw new Error('must not delete');
        },
      },
      manualDirectoryUser: { count: async () => 0 },
      organizationalUnit: { findUnique: async () => null },
    };
    await expect(
      deleteManualDirectoryOrganizationalUnit(
        prisma as never,
        'manual_only:ou:users',
      ),
    ).rejects.toBeInstanceOf(ManualDirectoryCatalogError);
  });

  it('rejects delete when mapped catalog users exist', async () => {
    const prisma = {
      manualDirectoryOrganizationalUnit: {
        findUnique: async () => ({
          externalId: 'manual_only:ou:users',
          distinguishedName: 'OU=Users,DC=example,DC=com',
          organizationalUnitPath: '/Users',
        }),
        count: async () => 0,
        delete: async () => {
          throw new Error('must not delete');
        },
      },
      manualDirectoryUser: { count: async () => 2 },
      organizationalUnit: { findUnique: async () => null },
    };
    await expect(
      deleteManualDirectoryOrganizationalUnit(
        prisma as never,
        'manual_only:ou:users',
      ),
    ).rejects.toMatchObject({ code: 'HAS_MAPPED_USERS' });
  });
});
