import { auditLogActions } from '../audit-log/audit-log.constants';
import { recordManualDirectoryCatalogChange } from '../directory-sync/record-manual-directory-catalog-change';
import { recordOrganizationalUnitChange } from './record-organizational-unit-change';
import { deleteOrganizationalUnitInTransaction } from './delete-organizational-unit';
import { OrganizationalUnitError } from './organizational-unit.error';

jest.mock('./record-organizational-unit-change', () => ({
  recordOrganizationalUnitChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../directory-sync/record-manual-directory-catalog-change', () => ({
  recordManualDirectoryCatalogChange: jest.fn().mockResolvedValue(undefined),
}));

/**
 * W2.37b: a unit that exists in the tree and in the manual-only catalogue has to
 * lose both rows in one commit. Before this the tree row disappeared, the
 * catalogue row stayed, and the unit kept showing up as a parent while
 * re-creating the same path failed with `DUPLICATE_PATH`. The operator also could
 * not delete the unit through the screen at all when the mirror row was missing
 * ("this OU is not in the manual-only catalogue").
 */
describe('deleteOrganizationalUnitInTransaction — manual catalogue mirror (W2.37b)', () => {
  const unit = {
    id: 'ou-1',
    name: 'Ogranak',
    type: 'BRANCH',
    distinguishedName: 'OU=Ogranak,DC=local',
    ouPath: '/Ogranak',
    parentId: null,
    company: null,
    department: null,
  };

  const catalogRow = {
    id: 'catalog-1',
    externalId: 'hash-ogranak',
    displayName: 'Ogranak',
    distinguishedName: 'OU=Ogranak,DC=local',
    organizationalUnitPath: '/Ogranak',
    parentExternalId: null,
    type: 'BRANCH',
  };

  function createTransaction(overrides: Partial<Record<string, unknown>> = {}) {
    const deleteUnit = jest.fn().mockResolvedValue(unit);
    const deleteCatalogRow = jest.fn().mockResolvedValue(catalogRow);
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      organizationalUnit: {
        findUnique: jest.fn().mockResolvedValue(unit),
        delete: deleteUnit,
        count: jest.fn().mockResolvedValue(0),
      },
      user: { count: jest.fn().mockResolvedValue(0) },
      group: { count: jest.fn().mockResolvedValue(0) },
      asset: { count: jest.fn().mockResolvedValue(0) },
      assetContract: { count: jest.fn().mockResolvedValue(0) },
      softwareLicense: { count: jest.fn().mockResolvedValue(0) },
      assetSignatory: { count: jest.fn().mockResolvedValue(0) },
      changeRequest: { count: jest.fn().mockResolvedValue(0) },
      knowledgeArticle: { count: jest.fn().mockResolvedValue(0) },
      knowledgeInterceptResolution: { count: jest.fn().mockResolvedValue(0) },
      problem: { count: jest.fn().mockResolvedValue(0) },
      routingRule: { count: jest.fn().mockResolvedValue(0) },
      slaRule: { count: jest.fn().mockResolvedValue(0) },
      reportSchedule: { count: jest.fn().mockResolvedValue(0) },
      ticket: { count: jest.fn().mockResolvedValue(0) },
      manualDirectoryOrganizationalUnit: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([catalogRow]),
        delete: deleteCatalogRow,
      },
      manualDirectoryUser: { count: jest.fn().mockResolvedValue(0) },
      manualDirectoryGroup: { count: jest.fn().mockResolvedValue(0) },
      organizationalUnitCatalogRevision: {
        upsert: jest.fn().mockResolvedValue({ revision: 1n }),
      },
      userRole: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
    return { transaction, deleteUnit, deleteCatalogRow };
  }

  beforeEach(() => {
    jest.mocked(recordOrganizationalUnitChange).mockClear();
    jest.mocked(recordManualDirectoryCatalogChange).mockClear();
  });

  it('removes the mirrored catalogue row and audits it as a catalogue change', async () => {
    const { transaction, deleteUnit, deleteCatalogRow } = createTransaction();

    await deleteOrganizationalUnitInTransaction(transaction as never, unit.id, {
      actorUserId: 'admin-1',
      requestId: 'req-1',
    });

    expect(deleteUnit).toHaveBeenCalledWith({ where: { id: unit.id } });
    expect(deleteCatalogRow).toHaveBeenCalledWith({ where: { externalId: catalogRow.externalId } });
    expect(recordManualDirectoryCatalogChange).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: auditLogActions.directoryCatalogUnitDeleted,
        entityId: catalogRow.id,
        metadata: expect.objectContaining({
          source: 'organizational_units',
          before: expect.objectContaining({ organizationalUnitPath: '/Ogranak' }),
        }),
      }),
    );
  });

  it('still deletes a unit that has no catalogue row', async () => {
    const { transaction, deleteCatalogRow } = createTransaction();
    transaction.manualDirectoryOrganizationalUnit.findMany.mockResolvedValue([]);

    await deleteOrganizationalUnitInTransaction(transaction as never, unit.id, {
      actorUserId: null,
      requestId: null,
    });

    expect(deleteCatalogRow).not.toHaveBeenCalled();
    expect(recordManualDirectoryCatalogChange).not.toHaveBeenCalled();
  });

  it('refuses when a stale catalogue child lives under the path', async () => {
    const { transaction, deleteUnit } = createTransaction();
    transaction.manualDirectoryOrganizationalUnit.count.mockResolvedValue(2);

    await expect(
      deleteOrganizationalUnitInTransaction(transaction as never, unit.id, {
        actorUserId: 'admin-1',
        requestId: null,
      }),
    ).rejects.toMatchObject({
      code: 'HAS_CHILDREN',
      blockers: [expect.objectContaining({ kind: 'directoryChildren', count: 2 })],
    });
    expect(deleteUnit).not.toHaveBeenCalled();
  });

  it('refuses when directory entries are mapped under the path', async () => {
    const { transaction, deleteUnit } = createTransaction();
    transaction.manualDirectoryUser.count.mockResolvedValue(3);

    await expect(
      deleteOrganizationalUnitInTransaction(transaction as never, unit.id, {
        actorUserId: 'admin-1',
        requestId: null,
      }),
    ).rejects.toBeInstanceOf(OrganizationalUnitError);
    await expect(
      deleteOrganizationalUnitInTransaction(transaction as never, unit.id, {
        actorUserId: 'admin-1',
        requestId: null,
      }),
    ).rejects.toMatchObject({
      code: 'HAS_MAPPED_USERS',
      blockers: [expect.objectContaining({ kind: 'directoryUsers', count: 3 })],
    });
    expect(deleteUnit).not.toHaveBeenCalled();
  });
});
