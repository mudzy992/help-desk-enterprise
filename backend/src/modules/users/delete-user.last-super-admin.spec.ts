jest.mock(
  './record-user-change',
  () => ({ recordUserChange: jest.fn().mockResolvedValue(undefined) }),
  { virtual: true },
);

import { deleteUser } from './delete-user';

describe('deleteUser SuperAdmin invariant (5.2.1 M3 B5)', () => {
  it('rejects deleting the final active SuperAdmin before any row is removed', async () => {
    const deleteUserRow = jest.fn();
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'last-super-admin-role' })
          .mockResolvedValueOnce(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          isActive: true,
          isLocalOnly: true,
          displayName: 'Admin',
          email: 'admin@example.test',
          organizationalUnitId: null,
          _count: { assignedTickets: 0, requestedTickets: 0 },
        }),
        delete: deleteUserRow,
      },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: unknown) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const invalidatePrincipal = jest.fn();

    await expect(deleteUser(prisma as never, 'admin-1', invalidatePrincipal)).rejects.toMatchObject({
      code: 'LAST_SUPER_ADMIN_REQUIRED',
    });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(deleteUserRow).not.toHaveBeenCalled();
    expect(invalidatePrincipal).not.toHaveBeenCalled();
  });
});
