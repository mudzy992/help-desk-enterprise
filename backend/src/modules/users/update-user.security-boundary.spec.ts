import { recordUserChange } from './record-user-change';
import { updateUser } from './update-user';
import type {
  AccountSecurityBoundaryPort,
  AccountSecurityCut,
} from '../authentication/security/account-security-boundary.service';

jest.mock('./list-users-summary', () => ({
  listUsersSummary: jest.fn().mockResolvedValue([
    {
      id: 'user-1',
      displayName: 'Local User',
      email: 'local@example.com',
      isActive: false,
      isLocalOnly: true,
      roleKey: 'USER',
      roleName: 'User',
      roleTone: 'user',
      organizationalUnitId: null,
      organizationalUnitName: null,
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
// The SUPER_ADMIN invariant has its own concurrency suite; this file is about the
// credential boundary, so the invariant is stubbed to the harmless answer.
jest.mock('./super-admin-invariant', () => ({
  lockActiveSuperAdminInvariant: jest.fn(async () => undefined),
  hasActiveSuperAdminRole: jest.fn(async () => false),
  assertAnotherActiveSuperAdminExists: jest.fn(async () => undefined),
}));

/*
  W2.22 (`BA-users-03`): a deactivation is an authentication boundary. The cut runs
  on the deactivation's own transaction, so the two can never disagree — and a
  failure of the cut must not leave a successful 2xx behind.
*/
describe('updateUser — deactivation cuts the credential boundary', () => {
  const activeUser = {
    id: 'user-1',
    email: 'local@example.com',
    isLocalOnly: true,
    displayName: 'Local User',
    organizationalUnitId: null,
    isActive: true,
  };
  const cut: AccountSecurityCut = {
    transition: 'deactivated',
    cutoffAt: '2026-10-29T10:00:00.000Z',
    sessions: 3,
    passkeys: 1,
    mfaFactors: 1,
    recoveryCodes: 8,
  };

  function boundary(overrides: Partial<{
    cut: jest.Mock;
    afterCommit: jest.Mock;
  }> = {}) {
    const cutWithinTransaction = overrides.cut ?? jest.fn(async () => cut);
    const afterCommit = overrides.afterCommit ?? jest.fn(async () => undefined);
    return { cutWithinTransaction, afterCommit } as unknown as AccountSecurityBoundaryPort & {
      cutWithinTransaction: jest.Mock;
      afterCommit: jest.Mock;
    };
  }

  function prisma(existing: typeof activeUser = activeUser) {
    const userUpdate = jest.fn(async () => ({}));
    const findByRole = jest.fn(async () => []);
    const transaction = {
      $executeRaw: jest.fn(async () => 1),
      user: {
        update: userUpdate,
        findUnique: jest.fn(async () => ({ ...activeUser, userRoles: [] })),
        findMany: findByRole,
      },
      userRole: { count: jest.fn(async () => 2) },
    };
    return {
      userUpdate,
      transaction,
      client: {
        user: { findUnique: jest.fn(async () => existing) },
        organizationalUnit: { findUnique: jest.fn(async () => ({ id: 'ou-1' })) },
        $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
      },
    };
  }

  beforeEach(() => jest.mocked(recordUserChange).mockClear());

  it('runs the cut inside the same transaction and only then reports success', async () => {
    const { client, transaction } = prisma();
    const port = boundary();
    const order: string[] = [];
    port.cutWithinTransaction.mockImplementation(async (client: unknown) => {
      // The cut must receive the transaction client, never the outer client.
      expect(client).toBe(transaction);
      order.push('cut');
      return cut;
    });
    port.afterCommit.mockImplementation(async () => {
      order.push('after');
    });

    await updateUser(
      client as never,
      { userId: 'user-1', isActive: false },
      async () => undefined,
      { actorUserId: 'admin-1', requestId: 'req-1' },
      port,
    );

    expect(port.cutWithinTransaction).toHaveBeenCalledWith(transaction, {
      userId: 'user-1',
      actorUserId: 'admin-1',
      transition: 'deactivated',
    });
    expect(port.afterCommit).toHaveBeenCalledWith({
      userId: 'user-1',
      actorUserId: 'admin-1',
      cut,
    });
    expect(order).toEqual(['cut', 'after']);
  });

  it('refuses the deactivation when the cut cannot be made durable', async () => {
    const { client } = prisma();
    const port = boundary({
      cut: jest.fn(async () => {
        throw new Error('audit/session write failed');
      }),
    });

    await expect(
      updateUser(
        client as never,
        { userId: 'user-1', isActive: false },
        async () => undefined,
        { actorUserId: 'admin-1', requestId: 'req-1' },
        port,
      ),
    ).rejects.toThrow('audit/session write failed');

    // No volatile half, no success path: the caller sees the failure, not a stale 2xx.
    expect(port.afterCommit).not.toHaveBeenCalled();
  });

  it('does not cut anything when the account is only reactivated', async () => {
    const inactive = { ...activeUser, isActive: false };
    const { client } = prisma(inactive);
    const port = boundary();

    await updateUser(
      client as never,
      { userId: 'user-1', isActive: true },
      async () => undefined,
      { actorUserId: 'admin-1', requestId: 'req-1' },
      port,
    );

    expect(port.cutWithinTransaction).not.toHaveBeenCalled();
    expect(port.afterCommit).not.toHaveBeenCalled();
  });

  it('leaves the profile-only update untouched', async () => {
    const { client } = prisma();
    const port = boundary();

    await updateUser(
      client as never,
      { userId: 'user-1', displayName: 'New Name' },
      async () => undefined,
      { actorUserId: 'admin-1', requestId: 'req-1' },
      port,
    );

    expect(port.cutWithinTransaction).not.toHaveBeenCalled();
  });
});
