import { updateUser } from './update-user';

jest.mock('./list-users-summary', () => ({
  listUsersSummary: jest.fn().mockResolvedValue([
    {
      id: 'user-1',
      displayName: 'Updated Name',
      email: 'local@example.com',
      isActive: true,
      isLocalOnly: true,
      roleKey: 'USER',
      roleName: 'User',
      roleTone: 'user',
      organizationalUnitId: 'ou-1',
      organizationalUnitName: 'IT',
      groupName: null,
      policyPackKey: null,
      openTicketCount: 0,
      mfa: null,
    },
  ]),
}));

describe('updateUser', () => {
  it('updates displayName and organizational unit', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'user-1',
            email: 'local@example.com',
            isLocalOnly: true,
          }),
        update,
      },
      organizationalUnit: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ou-1' }),
      },
    };
    const result = await updateUser(prisma as never, {
      userId: 'user-1',
      displayName: ' Updated Name ',
      organizationalUnitId: 'ou-1',
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        displayName: 'Updated Name',
        organizationalUnitId: 'ou-1',
      },
    });
    expect(result.displayName).toBe('Updated Name');
    expect(result.organizationalUnitId).toBe('ou-1');
  });

  it('rejects email changes for directory-linked users', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'linked@example.com',
          isLocalOnly: false,
        }),
        update: jest.fn(),
      },
      organizationalUnit: { findUnique: jest.fn() },
    };
    await expect(
      updateUser(prisma as never, {
        userId: 'user-1',
        email: 'new@example.com',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects email conflicts for local users', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'user-1',
            email: 'local@example.com',
            isLocalOnly: true,
          })
          .mockResolvedValueOnce({ id: 'user-2' }),
        update: jest.fn(),
      },
      organizationalUnit: { findUnique: jest.fn() },
    };
    await expect(
      updateUser(prisma as never, {
        userId: 'user-1',
        email: 'taken@example.com',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_CONFLICT' });
  });
});
