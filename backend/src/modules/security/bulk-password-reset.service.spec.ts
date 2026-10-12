import { UnauthorizedException } from '@nestjs/common';
import { AccountSecurityError } from '../authentication/security/account-security.error';
import { BulkPasswordResetService, bulkPasswordResetStepUpPurpose } from './bulk-password-reset.service';

/*
  Paket 5.4.0-d (M5): the SuperAdmin bulk password reset.

  The tests pin the promises the design makes: a stricter proof of identity, the
  exact eligibility set (no SUPER_ADMIN, nothing federated, nothing deleted),
  `mustChangePassword` instead of a password write, revocation of **every**
  eligible account, honest aggregate counts, idempotency and a privacy-clean
  audit entry.
*/

type Candidate = {
  readonly id: string;
  readonly mustChangePassword: boolean;
  readonly userRoles: readonly { readonly role: { readonly key: string } }[];
};

function candidate(
  id: string,
  mustChangePassword = false,
  roleKey = 'AGENT',
): Candidate {
  return { id, mustChangePassword, userRoles: [{ role: { key: roleKey } }] };
}

describe('BulkPasswordResetService', () => {
  const consumeFreshConfirmation = jest.fn();
  const mfaIsEnabled = jest.fn();
  const mfaVerify = jest.fn();
  const findById = jest.fn();
  const revokeAll = jest.fn();
  const invalidateUsers = jest.fn();
  const findMany = jest.fn();
  const updateMany = jest.fn();
  const auditRows: Record<string, unknown>[] = [];

  const auditClient = {
    $executeRaw: jest.fn(async () => 1),
    auditLog: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        auditRows.push(data);
        return data;
      }),
    },
  };

  const prisma = {
    user: { findMany, updateMany },
    $transaction: async (run: (client: unknown) => Promise<unknown>) => run(auditClient),
  };

  function createService(): BulkPasswordResetService {
    return new BulkPasswordResetService(
      prisma as never,
      { isEnabled: mfaIsEnabled, verify: mfaVerify } as never,
      { consumeFreshConfirmation } as never,
      { findById } as never,
      { revokeAll } as never,
      { invalidateUsers } as never,
    );
  }

  const caller = { subjectId: 'super-1', sessionId: 'session-1' };

  beforeEach(() => {
    consumeFreshConfirmation.mockReset().mockResolvedValue(false);
    mfaIsEnabled.mockReset().mockResolvedValue(true);
    mfaVerify.mockReset().mockResolvedValue('totp');
    findById.mockReset().mockResolvedValue({ id: 'super-1', email: 'super@example.com' });
    revokeAll.mockReset().mockResolvedValue(1);
    invalidateUsers.mockReset().mockResolvedValue(undefined);
    findMany.mockReset().mockResolvedValue([candidate('user-1'), candidate('user-2', true)]);
    updateMany.mockReset().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({
      count: where.id.in.length,
    }));
    auditRows.length = 0;
    auditClient.auditLog.create.mockClear();
  });

  it('accepts a fresh passkey step-up for its own purpose and skips TOTP entirely', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);

    const result = await createService().execute(caller, {});

    expect(consumeFreshConfirmation).toHaveBeenCalledWith(
      'session-1',
      bulkPasswordResetStepUpPurpose,
    );
    expect(bulkPasswordResetStepUpPurpose).toBe('bulk-password-reset');
    expect(mfaVerify).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
    expect(result).toEqual({
      eligibleUsers: 2,
      changedUsers: 1,
      revokedSessions: 2,
      failedUsers: 0,
    });
  });

  it('requires a current TOTP code when there is no fresh passkey step-up', async () => {
    const result = await createService().execute(caller, { code: ' 123456 ' });

    expect(mfaIsEnabled).toHaveBeenCalledWith('super-1');
    expect(mfaVerify).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'super-1' }),
      '123456',
    );
    expect(result.eligibleUsers).toBe(2);
  });

  it('refuses an account with no second factor instead of proceeding without proof', async () => {
    mfaIsEnabled.mockResolvedValue(false);

    await expect(createService().execute(caller, { code: '123456' })).rejects.toMatchObject({
      response: { code: 'IDENTITY_CONFIRMATION_REQUIRED', method: 'totp' },
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(revokeAll).not.toHaveBeenCalled();
  });

  it('never lets a legacy token without a session id use the passkey marker', async () => {
    mfaIsEnabled.mockResolvedValue(false);
    consumeFreshConfirmation.mockResolvedValue(true);

    await expect(
      createService().execute({ subjectId: 'super-1', sessionId: null }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(consumeFreshConfirmation).not.toHaveBeenCalled();
  });

  it('rejects a wrong TOTP code and writes nothing', async () => {
    mfaVerify.mockRejectedValue(new AccountSecurityError('MFA_INVALID_CODE'));

    await expect(createService().execute(caller, { code: '000000' })).rejects.toBeDefined();
    expect(updateMany).not.toHaveBeenCalled();
    expect(revokeAll).not.toHaveBeenCalled();
  });

  it('only targets the accounts the application itself manages a password for', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    findMany.mockResolvedValue([candidate('user-1'), candidate('super-2', false, 'SUPER_ADMIN')]);

    const result = await createService().execute(caller, {});

    const where = findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      isActive: true,
      isLocalOnly: true,
      localPasswordHash: { not: null },
      entraObjectId: null,
      directoryObjectGuid: null,
      anonymizedAt: null,
    });
    expect(result.eligibleUsers).toBe(1);
    expect(updateMany.mock.calls[0]![0].where.id.in).toEqual(['user-1']);
    expect(revokeAll).toHaveBeenCalledTimes(1);
    expect(revokeAll).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', actorUserId: 'super-1' }),
    );
  });

  it('revokes every eligible session, including accounts that were already flagged', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);

    const result = await createService().execute(caller, {});

    expect(updateMany.mock.calls[0]![0]).toEqual({
      where: { id: { in: ['user-1'] }, mustChangePassword: false },
      data: { mustChangePassword: true },
    });
    expect(revokeAll.mock.calls.map((call) => call[0].userId)).toEqual(['user-1', 'user-2']);
    expect(invalidateUsers).toHaveBeenCalledWith(['user-1', 'user-2']);
    expect(result.revokedSessions).toBe(2);
  });

  it('is idempotent: a repeat call changes nothing but still verifies and revokes remaining sessions', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    findMany.mockResolvedValue([candidate('user-1', true), candidate('user-2', true)]);

    const result = await createService().execute(caller, {});

    expect(updateMany).not.toHaveBeenCalled();
    expect(revokeAll).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      eligibleUsers: 2,
      changedUsers: 0,
      revokedSessions: 2,
      failedUsers: 0,
    });
  });

  it('reports a partial revocation failure instead of a full success', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    findMany.mockResolvedValue([
      candidate('user-1'),
      candidate('user-2'),
      candidate('user-3'),
    ]);
    revokeAll
      .mockResolvedValueOnce(3)
      .mockRejectedValueOnce(new Error('session registry unavailable'))
      .mockResolvedValueOnce(0);

    const result = await createService().execute(caller, {});

    expect(result).toEqual({
      eligibleUsers: 3,
      changedUsers: 3,
      revokedSessions: 3,
      failedUsers: 1,
    });
    // The remaining accounts are still processed after one failure.
    expect(revokeAll).toHaveBeenCalledTimes(3);
  });

  it('journals one aggregate entry with counts only', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);

    await createService().execute(caller, {});

    expect(auditRows).toHaveLength(1);
    const row = auditRows[0]!;
    expect(row.action).toBe('auth.admin_bulk_password_reset');
    expect(row.entityType).toBe('user');
    expect(row.entityId).toBe('super-1');
    expect(row.actorUserId).toBe('super-1');
    expect(row.metadata).toEqual({
      eligibleUsers: 2,
      changedUsers: 1,
      revokedSessions: 2,
      failedUsers: 0,
    });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('user-1');
    expect(serialized).not.toContain('user-2');
    expect(serialized).not.toContain('@');
    expect(serialized).not.toContain('123456');
  });

  it('never fails the action when the audit write fails', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    auditClient.auditLog.create.mockRejectedValueOnce(new Error('audit database down'));

    await expect(createService().execute(caller, {})).resolves.toMatchObject({
      changedUsers: 1,
    });
  });

  it('never fails the action when the principal cache invalidation fails', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    invalidateUsers.mockRejectedValueOnce(new Error('redis down'));

    await expect(createService().execute(caller, {})).resolves.toMatchObject({
      revokedSessions: 2,
    });
  });

  /*
    Paket 5.4.0-f acceptance, pinned in one place: the action reads as one call —
    the flagged set is exactly what the database query returned minus every
    SuperAdmin, the revocation carries the admin actor and the bulk reason, and
    no password (no hash, no temporary value) is written anywhere.
  */
  it('flags and revokes only the local accounts on a mixed page, and writes no password', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    findMany.mockResolvedValue([
      candidate('user-1'),
      candidate('super-9', false, 'SUPER_ADMIN'),
      candidate('user-2', true),
    ]);

    const result = await createService().execute(caller, {});

    expect(result).toMatchObject({ eligibleUsers: 2, changedUsers: 1, failedUsers: 0 });
    // Exactly the two local accounts, never the SuperAdmin.
    expect(updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: { in: ['user-1'] }, mustChangePassword: false },
      data: { mustChangePassword: true },
    });
    expect(revokeAll.mock.calls.map((call) => call[0])).toEqual([
      { userId: 'user-1', reason: 'admin', actorUserId: 'super-1' },
      { userId: 'user-2', reason: 'admin', actorUserId: 'super-1' },
    ]);

    // Nothing in this action may carry a credential: the only user write is the
    // flag itself, and no argument of any call mentions a hash or a temporary
    // password (the flag's own name is the one expected mention of "Password").
    const writes = JSON.stringify(updateMany.mock.calls);
    expect(writes).not.toMatch(/localPasswordHash|passwordHash|temporaryPassword|bcrypt|argon/i);
    expect(Object.keys(updateMany.mock.calls[0]![0].data)).toEqual(['mustChangePassword']);
    expect(updateMany.mock.calls[0]![0].data).toEqual({ mustChangePassword: true });
  });
});
