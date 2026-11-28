jest.mock('../../generated/prisma/enums', () => ({
  OrganizationalUnitType: {
    DIRECTORATE: 'DIRECTORATE',
    BRANCH: 'BRANCH',
    OFFICE: 'OFFICE',
    SECTOR: 'SECTOR',
    SERVICE: 'SERVICE',
  },
}), { virtual: true });

import { auditLogActions } from '../audit-log/audit-log.constants';
import { createManualDirectoryOrganizationalUnit } from './create-manual-directory-organizational-unit';
import { recordManualDirectoryCatalogChange } from './record-manual-directory-catalog-change';

jest.mock('./record-manual-directory-catalog-change', () => ({
  recordManualDirectoryCatalogChange: jest.fn().mockResolvedValue(undefined),
}));

describe('createManualDirectoryOrganizationalUnit', () => {
  it('creates and audits the manual catalog row in one transaction without credentials', async () => {
    const created = {
      id: 'catalog-1',
      externalId: 'manual_only:ou:users',
      displayName: 'Users',
      distinguishedName: 'OU=Users,DC=example,DC=com',
      organizationalUnitPath: '/Users',
      parentExternalId: null,
      type: 'BRANCH',
    };
    const transaction = {
      manualDirectoryOrganizationalUnit: {
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      manualDirectoryOrganizationalUnit: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const result = await createManualDirectoryOrganizationalUnit(
      prisma as never,
      { displayName: 'Users' },
      { actorUserId: 'admin-1', requestId: 'req-1' },
    );
    expect(result.id).toBe('catalog-1');
    expect(recordManualDirectoryCatalogChange).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: auditLogActions.directoryCatalogUnitCreated,
        entityId: 'catalog-1',
        actorUserId: 'admin-1',
        requestId: 'req-1',
        metadata: expect.objectContaining({
          source: 'manual_directory_catalog',
          after: expect.objectContaining({ name: 'Users' }),
        }),
      }),
    );
    expect(JSON.stringify(jest.mocked(recordManualDirectoryCatalogChange).mock.calls)).not.toContain('password');
  });
});
