import { deleteOrganizationalUnit } from './delete-organizational-unit';
jest.mock(
  './count-organizational-unit-delete-blockers',
  () => ({ countOrganizationalUnitDeleteBlockers: jest.fn().mockResolvedValue([]) }),
  { virtual: true },
);

describe('deleteOrganizationalUnit SuperAdmin invariant (5.2.1 M3 B5)', () => {
  it('serializes the OU cascade check and performs no delete when it would remove the final active SuperAdmin', async () => {
    const deleteUnit = jest.fn();
    const roleFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'last-super-admin-assignment' })
      .mockResolvedValueOnce(null);
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      organizationalUnit: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ou-1',
          name: 'Users',
          type: 'BRANCH',
          distinguishedName: 'OU=Users,DC=example,DC=com',
          ouPath: '/Users',
          parentId: null,
          company: null,
          department: null,
          _count: { children: 0, users: 0 },
        }),
        delete: deleteUnit,
      },
      userRole: {
        findFirst: roleFindFirst,
        findMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: unknown) => Promise<unknown>) =>
        operation(transaction),
      ),
    };

    await expect(deleteOrganizationalUnit(prisma as never, 'ou-1')).rejects.toMatchObject({
      code: 'LAST_SUPER_ADMIN_REQUIRED',
    });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(deleteUnit).not.toHaveBeenCalled();
  });
});
