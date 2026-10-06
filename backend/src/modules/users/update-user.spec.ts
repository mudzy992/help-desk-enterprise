import { auditLogActions } from '../audit-log/audit-log.constants';
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
jest.mock('./record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));

import { recordUserChange } from './record-user-change';

describe('updateUser', () => {
  const user = {
    id: 'user-1',
    email: 'local@example.com',
    isLocalOnly: true,
    displayName: 'Old Name',
    organizationalUnitId: null,
    isActive: true,
  };

  beforeEach(() => jest.mocked(recordUserChange).mockClear());

  it('updates and audits displayName and organizational unit atomically', async () => {
    const update = jest.fn().mockResolvedValue({});
    const transaction = { user: { update } };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      organizationalUnit: { findUnique: jest.fn().mockResolvedValue({ id: 'ou-1' }) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
    const result = await updateUser(
      prisma as never,
      { userId: 'user-1', displayName: ' Updated Name ', organizationalUnitId: 'ou-1' },
      async () => {},
      { actorUserId: 'admin-1', requestId: 'req-1' },
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: 'Updated Name', organizationalUnitId: 'ou-1' },
    });
    expect(recordUserChange).toHaveBeenCalledWith(transaction, {
      action: auditLogActions.userUpdated,
      entityId: 'user-1',
      actorUserId: 'admin-1',
      requestId: 'req-1',
      organizationalUnitId: 'ou-1',
      metadata: {
        before: { displayName: 'Old Name', organizationalUnitId: null },
        after: { displayName: 'Updated Name', organizationalUnitId: 'ou-1' },
      },
    });
    expect(result.displayName).toBe('Updated Name');
    expect(result.organizationalUnitId).toBe('ou-1');
  });

  it('rolls back the user mutation when the audit insert fails', async () => {
    const auditFailure = new Error('audit insert failed');
    let persisted = { ...user };
    const prisma = {
      user: { findUnique: jest.fn(async () => persisted) },
      organizationalUnit: { findUnique: jest.fn().mockResolvedValue({ id: 'ou-1' }) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => {
        let staged = { ...persisted };
        const transaction = {
          user: {
            update: jest.fn(async ({ data }: { data: Partial<typeof user> }) => {
              staged = { ...staged, ...data };
              return staged;
            }),
          },
        };
        const result = await callback(transaction);
        persisted = staged;
        return result;
      }),
    };
    jest.mocked(recordUserChange).mockRejectedValueOnce(auditFailure);

    await expect(
      updateUser(
        prisma as never,
        { userId: user.id, displayName: 'Uncommitted Name' },
        jest.fn(),
      ),
    ).rejects.toBe(auditFailure);
    expect(persisted).toEqual(user);
  });

  it('rejects email changes for directory-linked users', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ ...user, isLocalOnly: false }) },
      organizationalUnit: { findUnique: jest.fn() },
    };
    await expect(
      updateUser(prisma as never, { userId: 'user-1', email: 'new@example.com' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('invalidates cached authorization after the audited active/unit mutation', async () => {
    const update = jest.fn().mockResolvedValue({});
    const transaction = { user: { update } };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      organizationalUnit: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
    const invalidatePrincipal = jest.fn().mockResolvedValue(1);
    await updateUser(
      prisma as never,
      { userId: 'user-1', isActive: false },
      invalidatePrincipal,
    );
    expect(update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { isActive: false } });
    expect(recordUserChange).toHaveBeenCalledTimes(1);
    expect(invalidatePrincipal).toHaveBeenCalledWith('user-1');
  });

  it('does not audit or invalidate when the update changed nothing', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const invalidatePrincipal = jest.fn().mockResolvedValue(1);
    await updateUser(prisma as never, { userId: 'user-1' }, invalidatePrincipal);
    expect(recordUserChange).not.toHaveBeenCalled();
    expect(invalidatePrincipal).not.toHaveBeenCalled();
  });

  it('rejects email conflicts for local users', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(user)
          .mockResolvedValueOnce({ id: 'user-2' }),
      },
      organizationalUnit: { findUnique: jest.fn() },
    };
    await expect(
      updateUser(prisma as never, { userId: 'user-1', email: 'taken@example.com' }),
    ).rejects.toMatchObject({ code: 'EMAIL_CONFLICT' });
  });
});
