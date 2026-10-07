import { appendAuditLog } from '../audit-log/append-audit-log';
import { auditLogActions } from '../audit-log/audit-log.constants';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { assignUserRole } from './assign-user-role';

jest.mock('../audit-log/append-audit-log', () => ({
  appendAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('assignUserRole SuperAdmin identity invariant', () => {
  const input = {
    userId: 'user-1',
    roleKey: authorizationRoleKeys.superAdmin,
    actorUserId: 'admin-1',
    actorIsSuperAdmin: true,
    requestId: 'req-1',
  };

  function createWorld() {
    const eligibleUser = {
      id: 'user-1',
      isActive: true,
      isLocalOnly: true,
      entraObjectId: null,
      directoryObjectGuid: null,
    };
    const createdRole = {
      id: 'user-role-1',
      role: { key: authorizationRoleKeys.superAdmin, name: 'SuperAdmin' },
      organizationalUnit: null,
      service: null,
    };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findUnique: jest.fn().mockResolvedValue(eligibleUser) },
      userRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdRole),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(eligibleUser) },
      role: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'role-super-admin',
          key: authorizationRoleKeys.superAdmin,
          name: 'SuperAdmin',
        }),
      },
      organizationalUnit: { findUnique: jest.fn() },
      service: { findUnique: jest.fn() },
      userRole: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback(transaction)),
    };
    return { prisma, transaction, eligibleUser, createdRole };
  }

  beforeEach(() => jest.mocked(appendAuditLog).mockClear());

  it('requires an active local-only identity before assigning SuperAdmin', async () => {
    const { prisma, transaction } = createWorld();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      isActive: true,
      isLocalOnly: false,
      entraObjectId: 'entra-user-1',
      directoryObjectGuid: null,
    });

    await expect(assignUserRole(prisma as never, input)).rejects.toMatchObject({
      code: 'SUPER_ADMIN_LOCAL_IDENTITY_REQUIRED',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.userRole.create).not.toHaveBeenCalled();
    expect(appendAuditLog).not.toHaveBeenCalled();
  });

  it('serializes the grant and rechecks identity within the transaction', async () => {
    const { prisma, transaction } = createWorld();
    transaction.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      isActive: true,
      isLocalOnly: false,
      entraObjectId: 'entra-user-1',
      directoryObjectGuid: null,
    });

    await expect(assignUserRole(prisma as never, input)).rejects.toMatchObject({
      code: 'SUPER_ADMIN_LOCAL_IDENTITY_REQUIRED',
    });
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.userRole.create).not.toHaveBeenCalled();
    expect(appendAuditLog).not.toHaveBeenCalled();
  });

  it('audits and invalidates a new active local SuperAdmin assignment in the same transaction', async () => {
    const { prisma, transaction } = createWorld();
    const invalidatePrincipal = jest.fn().mockResolvedValue(1);

    await expect(assignUserRole(prisma as never, input, invalidatePrincipal)).resolves.toEqual({
      id: 'user-role-1',
      roleKey: authorizationRoleKeys.superAdmin,
      roleName: 'SuperAdmin',
      organizationalUnitId: null,
      organizationalUnitPath: null,
      serviceId: null,
      serviceName: null,
    });
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.userRole.create).toHaveBeenCalledTimes(1);
    expect(appendAuditLog).toHaveBeenCalledWith(transaction, expect.objectContaining({
      action: auditLogActions.userRoleAssign,
      actorUserId: 'admin-1',
      requestId: 'req-1',
    }));
    expect(invalidatePrincipal).toHaveBeenCalledWith('user-1');
  });
});
