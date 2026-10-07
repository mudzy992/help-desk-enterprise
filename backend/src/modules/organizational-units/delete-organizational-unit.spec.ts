import { auditLogActions } from '../audit-log/audit-log.constants';
import { recordOrganizationalUnitChange } from './record-organizational-unit-change';
import { deleteOrganizationalUnitInTransaction } from './delete-organizational-unit';

jest.mock('./record-organizational-unit-change', () => ({
  recordOrganizationalUnitChange: jest.fn().mockResolvedValue(undefined),
}));

describe('deleteOrganizationalUnitInTransaction', () => {
  const unit = {
    id: 'ou-1',
    name: 'Users',
    type: 'BRANCH',
    distinguishedName: 'OU=Users,DC=example,DC=com',
    ouPath: '/Users',
    parentId: null,
    company: null,
    department: null,
  };

  function createTransaction(overrides: Partial<Record<string, unknown>> = {}) {
    const deleteUnit = jest.fn().mockResolvedValue(unit);
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
      userRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([
          { userId: 'user-1' },
          { userId: 'user-1' },
          { userId: 'user-2' },
        ]),
      },
      ...overrides,
    };
    return { transaction, deleteUnit };
  }

  beforeEach(() => jest.mocked(recordOrganizationalUnitChange).mockClear());

  it('returns a warning, audits removed scoped roles, and reports cache invalidation targets', async () => {
    const { transaction, deleteUnit } = createTransaction();
    const context = { actorUserId: 'admin-1', requestId: 'req-1' };
    const result = await deleteOrganizationalUnitInTransaction(
      transaction as never,
      unit.id,
      context,
    );
    expect(deleteUnit).toHaveBeenCalledWith({ where: { id: unit.id } });
    expect(result).toEqual({
      affectedUserIds: ['user-1', 'user-2'],
      warnings: [{ code: 'ROLE_ASSIGNMENTS_REMOVED', count: 3 }],
    });
    expect(recordOrganizationalUnitChange).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: auditLogActions.organizationalUnitDeleted,
        entityId: unit.id,
        actorUserId: 'admin-1',
        requestId: 'req-1',
        metadata: expect.objectContaining({
          source: 'organizational_units',
          removedRoleAssignments: 3,
          affectedUserIds: ['user-1', 'user-2'],
          blockers: [],
        }),
      }),
    );
  });

  it('refuses to cascade-delete the only active local SuperAdmin assignment in the OU', async () => {
    const { transaction, deleteUnit } = createTransaction();
    transaction.userRole.findFirst
      .mockResolvedValueOnce({ id: 'last-super-admin-role' })
      .mockResolvedValueOnce(null);

    await expect(
      deleteOrganizationalUnitInTransaction(transaction as never, unit.id, {
        actorUserId: 'admin-2',
        requestId: 'req-delete-ou',
      }),
    ).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN_REQUIRED' });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(deleteUnit).not.toHaveBeenCalled();
    expect(recordOrganizationalUnitChange).not.toHaveBeenCalled();
  });

  it('allows an OU cascade when another active local SuperAdmin assignment remains outside it', async () => {
    const { transaction, deleteUnit } = createTransaction();
    transaction.userRole.findFirst
      .mockResolvedValueOnce({ id: 'scoped-super-admin-role' })
      .mockResolvedValueOnce({ id: 'global-super-admin-role' });

    await expect(
      deleteOrganizationalUnitInTransaction(transaction as never, unit.id, {
        actorUserId: 'admin-2',
        requestId: 'req-delete-ou',
      }),
    ).resolves.toMatchObject({
      affectedUserIds: ['user-1', 'user-2'],
      warnings: [{ code: 'ROLE_ASSIGNMENTS_REMOVED', count: 3 }],
    });
    expect(deleteUnit).toHaveBeenCalledWith({ where: { id: unit.id } });
  });

  it('returns typed blocker counts and never deletes an OU with linked groups', async () => {
    const group = { count: jest.fn().mockResolvedValue(4) };
    const { transaction, deleteUnit } = createTransaction({ group });
    await expect(
      deleteOrganizationalUnitInTransaction(transaction as never, unit.id, {
        actorUserId: null,
        requestId: null,
      }),
    ).rejects.toMatchObject({
      code: 'HAS_GROUPS',
      blockers: [{ kind: 'groups', count: 4 }],
    });
    expect(deleteUnit).not.toHaveBeenCalled();
    expect(recordOrganizationalUnitChange).not.toHaveBeenCalled();
  });

  it('blocks linked local or directory users with a concrete count', async () => {
    const user = { count: jest.fn().mockResolvedValue(2) };
    const { transaction, deleteUnit } = createTransaction({ user });
    await expect(
      deleteOrganizationalUnitInTransaction(transaction as never, unit.id, {
        actorUserId: null,
        requestId: null,
      }),
    ).rejects.toMatchObject({
      code: 'HAS_MAPPED_USERS',
      blockers: [{ kind: 'mappedUsers', count: 2 }],
    });
    expect(deleteUnit).not.toHaveBeenCalled();
  });
});
