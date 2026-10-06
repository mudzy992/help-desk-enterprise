import { auditLogActions } from '../audit-log/audit-log.constants';
import { deleteOrganizationalUnitInTransaction } from '../organizational-units/delete-organizational-unit';
import { recordOrganizationalUnitChange } from '../organizational-units/record-organizational-unit-change';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import { deleteManualDirectoryOrganizationalUnit } from './delete-manual-directory-organizational-unit';

jest.mock('../organizational-units/delete-organizational-unit', () => ({
  deleteOrganizationalUnitInTransaction: jest.fn(),
}));
jest.mock('../organizational-units/record-organizational-unit-change', () => ({
  recordOrganizationalUnitChange: jest.fn().mockResolvedValue(undefined),
}));

describe('deleteManualDirectoryOrganizationalUnit', () => {
  const catalogUnit = {
    id: 'catalog-row-1',
    externalId: 'manual_only:ou:users',
    displayName: 'Users',
    distinguishedName: 'OU=Users,DC=example,DC=com',
    organizationalUnitPath: '/Users',
    parentExternalId: null,
    type: 'BRANCH',
  };

  function createPrisma(input: {
    readonly childCount?: number;
    readonly userCount?: number;
    readonly groupCount?: number;
    readonly materialized?: { readonly id: string } | null;
  } = {}) {
    const transaction = {
      manualDirectoryOrganizationalUnit: {
        findUnique: jest.fn().mockResolvedValue(catalogUnit),
        count: jest.fn().mockResolvedValue(input.childCount ?? 0),
        delete: jest.fn().mockResolvedValue(catalogUnit),
      },
      manualDirectoryUser: { count: jest.fn().mockResolvedValue(input.userCount ?? 0) },
      manualDirectoryGroup: { count: jest.fn().mockResolvedValue(input.groupCount ?? 0) },
      organizationalUnit: {
        findUnique: jest.fn().mockResolvedValue(input.materialized ?? null),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    return { prisma, transaction };
  }

  beforeEach(() => {
    jest.mocked(deleteOrganizationalUnitInTransaction).mockReset();
    jest.mocked(recordOrganizationalUnitChange).mockReset().mockResolvedValue(undefined);
  });

  it('rejects deletion when catalog children exist and reports the count', async () => {
    const { prisma, transaction } = createPrisma({ childCount: 2 });
    await expect(
      deleteManualDirectoryOrganizationalUnit(prisma as never, catalogUnit.externalId),
    ).rejects.toMatchObject({
      code: 'HAS_CHILDREN',
      blockers: [{ kind: 'directoryChildren', count: 2 }],
    });
    expect(transaction.manualDirectoryOrganizationalUnit.delete).not.toHaveBeenCalled();
    expect(deleteOrganizationalUnitInTransaction).not.toHaveBeenCalled();
  });

  it('blocks catalog users and groups instead of deleting them', async () => {
    const users = createPrisma({ userCount: 3 });
    await expect(
      deleteManualDirectoryOrganizationalUnit(users.prisma as never, catalogUnit.externalId),
    ).rejects.toMatchObject({
      code: 'HAS_MAPPED_USERS',
      blockers: [{ kind: 'directoryUsers', count: 3 }],
    });
    expect(users.transaction.manualDirectoryOrganizationalUnit.delete).not.toHaveBeenCalled();

    const groups = createPrisma({ groupCount: 2 });
    await expect(
      deleteManualDirectoryOrganizationalUnit(groups.prisma as never, catalogUnit.externalId),
    ).rejects.toMatchObject({
      code: 'HAS_GROUPS',
      blockers: [{ kind: 'directoryGroups', count: 2 }],
    });
    expect(groups.transaction.manualDirectoryOrganizationalUnit.delete).not.toHaveBeenCalled();
  });

  it('deletes the materialized OU and catalog row in the same transaction', async () => {
    const { prisma, transaction } = createPrisma({ materialized: { id: 'live-ou-1' } });
    jest.mocked(deleteOrganizationalUnitInTransaction).mockResolvedValue({
      warnings: [{ code: 'ROLE_ASSIGNMENTS_REMOVED', count: 2 }],
      affectedUserIds: ['user-1'],
    });
    const context = { actorUserId: 'admin-1', requestId: 'req-1' };
    const result = await deleteManualDirectoryOrganizationalUnit(
      prisma as never,
      catalogUnit.externalId,
      context,
    );
    expect(deleteOrganizationalUnitInTransaction).toHaveBeenCalledWith(
      transaction,
      'live-ou-1',
      context,
      'manual_directory_catalog',
    );
    expect(transaction.manualDirectoryOrganizationalUnit.delete).toHaveBeenCalledWith({
      where: { externalId: catalogUnit.externalId },
    });
    expect(result).toEqual({
      warnings: [{ code: 'ROLE_ASSIGNMENTS_REMOVED', count: 2 }],
      affectedUserIds: ['user-1'],
    });
  });

  it('rolls back the live OU delete when its audit insert fails inside the catalog transaction', async () => {
    const auditFailure = new Error('audit insert failed');
    let persisted = { catalogExists: true, liveUnitExists: true };
    let activeState = persisted;
    const transaction = {
      manualDirectoryOrganizationalUnit: {
        findUnique: jest.fn(async () => activeState.catalogExists ? catalogUnit : null),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn(async () => {
          activeState.catalogExists = false;
          return catalogUnit;
        }),
      },
      manualDirectoryUser: { count: jest.fn().mockResolvedValue(0) },
      manualDirectoryGroup: { count: jest.fn().mockResolvedValue(0) },
      organizationalUnit: {
        findUnique: jest.fn(async () => activeState.liveUnitExists ? { id: 'live-ou-1' } : null),
        delete: jest.fn(async () => {
          activeState.liveUnitExists = false;
          return { id: 'live-ou-1' };
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => {
        const staged = { ...persisted };
        activeState = staged;
        try {
          const result = await callback(transaction);
          persisted = staged;
          return result;
        } finally {
          activeState = persisted;
        }
      }),
    };
    jest.mocked(deleteOrganizationalUnitInTransaction).mockImplementation(async (client) => {
      const tx = client as unknown as typeof transaction;
      await tx.organizationalUnit.delete({ where: { id: 'live-ou-1' } });
      await recordOrganizationalUnitChange(tx as never, {
        action: auditLogActions.organizationalUnitDeleted,
        entityId: 'live-ou-1',
        actorUserId: 'admin-1',
        requestId: 'req-1',
        metadata: { source: 'manual_directory_catalog' },
      });
      return { warnings: [], affectedUserIds: [] };
    });
    jest.mocked(recordOrganizationalUnitChange).mockRejectedValueOnce(auditFailure);

    await expect(
      deleteManualDirectoryOrganizationalUnit(prisma as never, catalogUnit.externalId),
    ).rejects.toBe(auditFailure);
    expect(persisted).toEqual({ catalogExists: true, liveUnitExists: true });
    expect(transaction.manualDirectoryOrganizationalUnit.delete).not.toHaveBeenCalled();
  });

  it('audits and removes a catalog-only OU when it has not been materialized', async () => {
    const { prisma, transaction } = createPrisma();
    await deleteManualDirectoryOrganizationalUnit(prisma as never, catalogUnit.externalId, {
      actorUserId: 'admin-1',
      requestId: 'req-2',
    });
    expect(recordOrganizationalUnitChange).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: auditLogActions.organizationalUnitDeleted,
        entityId: catalogUnit.id,
        actorUserId: 'admin-1',
        requestId: 'req-2',
        metadata: expect.objectContaining({
          source: 'manual_directory_catalog',
          removedRoleAssignments: 0,
          affectedUserIds: [],
        }),
      }),
    );
    expect(transaction.manualDirectoryOrganizationalUnit.delete).toHaveBeenCalled();
  });

  it('reports a missing catalog row', async () => {
    const missingPrisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback({
          manualDirectoryOrganizationalUnit: { findUnique: jest.fn().mockResolvedValue(null) },
        }),
      ),
    };
    await expect(
      deleteManualDirectoryOrganizationalUnit(missingPrisma as never, catalogUnit.externalId),
    ).rejects.toBeInstanceOf(ManualDirectoryCatalogError);
  });
});
