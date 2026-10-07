import { removePolicyPackUserGrants } from './remove-policy-pack-user-grants';

describe('removePolicyPackUserGrants', () => {
  it('cannot remove a SuperAdmin assignment even if called with a malformed legacy plan', async () => {
    const deleteMany = jest.fn();
    const prisma = { userRole: { deleteMany } };
    const catalog = { roleIdsByKey: new Map([['SUPER_ADMIN', 'super-role-id']]) };
    await expect(
      removePolicyPackUserGrants(
        prisma as never,
        catalog as never,
        [{
          userId: 'last-super-admin',
          roleKey: 'SUPER_ADMIN',
          permissionKeys: [],
          organizationalUnitId: null,
          serviceId: null,
        }],
      ),
    ).rejects.toMatchObject({ code: 'SUPER_ADMIN_GRANT_FORBIDDEN' });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
