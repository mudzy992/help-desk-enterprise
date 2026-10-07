import { appendAuditLog } from '../audit-log/append-audit-log';
import { removeUserRole } from './remove-user-role';

jest.mock('../audit-log/append-audit-log', () => ({
  appendAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('removeUserRole SuperAdmin invariant', () => {
  const input = {
    userId: 'admin-1',
    userRoleId: 'role-1',
    actorUserId: 'admin-2',
    requestId: 'req-1',
  };
  const activeSuperAdminRole = {
    id: 'role-1',
    role: { key: 'SUPER_ADMIN' },
    organizationalUnitId: null,
    serviceId: null,
    user: {
      isActive: true,
      isLocalOnly: true,
      entraObjectId: null,
      directoryObjectGuid: null,
    },
  };

  beforeEach(() => jest.mocked(appendAuditLog).mockClear());

  function makeTransaction(userRoleFindFirst: jest.Mock) {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: {
        findFirst: userRoleFindFirst,
        delete: jest.fn().mockResolvedValue({ id: 'role-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
    return { prisma, transaction };
  }

  it('rejects removing the last active SuperAdmin role without partial writes', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(activeSuperAdminRole)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const { prisma, transaction } = makeTransaction(findFirst);
    const invalidate = jest.fn();

    await expect(removeUserRole(prisma as never, input, invalidate)).rejects.toMatchObject({
      code: 'LAST_SUPER_ADMIN_REQUIRED',
    });
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.userRole.delete).not.toHaveBeenCalled();
    expect(appendAuditLog).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(transaction.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      findFirst.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('allows removing a role while another active SuperAdmin remains', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(activeSuperAdminRole)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'other-admin-role' });
    const { prisma, transaction } = makeTransaction(findFirst);
    const invalidate = jest.fn().mockResolvedValue(undefined);

    await expect(removeUserRole(prisma as never, input, invalidate)).resolves.toBeUndefined();
    expect(transaction.userRole.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
    expect(appendAuditLog).toHaveBeenCalledWith(transaction, expect.objectContaining({
      entityId: 'role-1',
      metadata: expect.objectContaining({ roleKey: 'SUPER_ADMIN' }),
    }));
    expect(invalidate).toHaveBeenCalledWith('admin-1');
  });

  it('does not block removing one of several SuperAdmin assignments on the same active user', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(activeSuperAdminRole)
      .mockResolvedValueOnce({ id: 'another-role-on-same-user' });
    const { prisma, transaction } = makeTransaction(findFirst);

    await expect(removeUserRole(prisma as never, input)).resolves.toBeUndefined();
    expect(transaction.userRole.delete).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
