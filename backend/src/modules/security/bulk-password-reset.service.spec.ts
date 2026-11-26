import { UnauthorizedException } from '@nestjs/common';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { AccountSecurityError } from '../authentication/security/account-security.error';
import { BulkPasswordResetService, bulkPasswordResetStepUpPurpose } from './bulk-password-reset.service';
import { StepUpPolicyService } from './step-up-policy.service';

/*
  Paket 5.4.0-d (M5): the SuperAdmin bulk password reset.

  The tests pin the promises the design makes: a stricter proof of identity, the
  exact eligibility set (no SUPER_ADMIN, nothing federated, nothing deleted),
  `mustChangePassword` instead of a password write, revocation of **every**
  eligible account, honest aggregate counts, idempotency and a privacy-clean
  audit entry.

  W2.23 (`BA-security-02`): the ordering and honesty half. The durable block —
  cutoff, live session rows and the flag, one transaction per target — must be
  committed *before* the Redis accelerator runs, an accelerator outage must leave
  every target unusable and still be reported (`pendingUsers` + `PARTIAL`, never a
  silent 200), a block that cannot be committed must be rolled back whole and
  reported (`failedUsers` + `PARTIAL`), and a forced password change must never
  cost the account its second factor.
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

type FlagWrite = { where: Record<string, unknown>; data: Record<string, unknown> };
type SessionWrite = { where: Record<string, unknown>; data: Record<string, unknown> };

describe('BulkPasswordResetService', () => {
  const consumeFreshConfirmation = jest.fn();
  const mfaIsEnabled = jest.fn();
  const mfaVerify = jest.fn();
  const findById = jest.fn();
  const revokeAll = jest.fn();
  const invalidateUsers = jest.fn();
  const findMany = jest.fn();
  const updateMany = jest.fn();
  const userSessionUpdateMany = jest.fn();
  const factorDelete = jest.fn();
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

  /**
   * The transaction client the service must use for the durable half. Every model
   * the block touches is here, and so is the factor deletion it must never call.
   */
  const transactionClient = {
    $executeRaw: jest.fn(async () => 1),
    user: { updateMany },
    userSession: { updateMany: userSessionUpdateMany },
    userMfa: { deleteMany: factorDelete },
    userMfaRecoveryCode: { deleteMany: factorDelete },
    userPasskeyCredential: { deleteMany: factorDelete },
    auditLog: auditClient.auditLog,
  };

  /** Ids whose transaction must throw, to model a database fault on one target. */
  let failingTargets = new Set<string>();

  const prisma = {
    user: { findMany, updateMany },
    $transaction: async (run: (client: unknown) => Promise<unknown>) => {
      const client =
        failingTargets.size === 0
          ? transactionClient
          : {
              ...transactionClient,
              // `user.updateMany` is the first statement of the block; make it the
              // one that fails so the fault happens before anything is written.
              user: {
                updateMany: jest.fn(async (args: FlagWrite) => {
                  if (failingTargets.has(String(args.where.id))) {
                    throw new Error('database write failed');
                  }
                  return updateMany(args);
                }),
              },
            };
      return run(client);
    },
  };

  /**
   * W2.24 (`BA-security-03`): the aggregate entry now goes through the durable
   * privileged-audit writer instead of a fire-and-forget insert. This fake keeps
   * the two observable behaviours of the real one: a healthy write lands
   * immediately (`delivered`), and during an outage the event is parked as a
   * durable intent (`pending`) that a later replay turns into exactly one row.
   */
  const pendingAuditIntents: Record<string, unknown>[] = [];
  let auditOutage = false;
  const privilegedAudit = {
    record: jest.fn(async (input: Record<string, unknown>) => {
      if (auditOutage) {
        pendingAuditIntents.push(input);
        return 'pending' as const;
      }
      try {
        await recordAuditEntry(prisma as never, input as never);
        return 'delivered' as const;
      } catch {
        // The real writer never throws: a failed immediate write is a durable
        // intent, and only a failed *intent* write reads as `unavailable`.
        pendingAuditIntents.push(input);
        return 'unavailable' as const;
      }
    }),
  };

  function createService(): BulkPasswordResetService {
    const stepUpPolicy = new StepUpPolicyService(
      { isEnabled: mfaIsEnabled, verify: mfaVerify } as never,
      { consumeFreshConfirmation } as never,
      { findById } as never,
    );
    return new BulkPasswordResetService(
      prisma as never,
      stepUpPolicy,
      { revokeAll } as never,
      { invalidateUsers } as never,
      privilegedAudit as never,
    );
  }

  const caller = { subjectId: 'super-1', sessionId: 'session-1' };

  /**
   * Stateful model of the `mustChangePassword` column, so the conditional flag
   * write reports exactly what the database would: 1 for a row that was still
   * `false`, 0 for one a previous run already flagged.
   */
  let flagState = new Map<string, boolean>();

  function setCandidates(list: Candidate[]): void {
    findMany.mockResolvedValue(list);
    flagState = new Map(list.map((user) => [user.id, user.mustChangePassword]));
  }

  /** Flag writes only (the second user write in a block is the cutoff). */
  function flagWrites(): FlagWrite[] {
    return updateMany.mock.calls
      .map((call) => call[0] as FlagWrite)
      .filter((args) => 'mustChangePassword' in (args.data ?? {}));
  }

  /** Cutoff writes (`tokensInvalidBefore` + cleared exception). */
  function cutoffWrites(): FlagWrite[] {
    return updateMany.mock.calls
      .map((call) => call[0] as FlagWrite)
      .filter((args) => 'tokensInvalidBefore' in (args.data ?? {}));
  }

  function sessionWrites(): SessionWrite[] {
    return userSessionUpdateMany.mock.calls.map((call) => call[0] as SessionWrite);
  }

  beforeEach(() => {
    consumeFreshConfirmation.mockReset().mockResolvedValue(false);
    mfaIsEnabled.mockReset().mockResolvedValue(true);
    mfaVerify.mockReset().mockResolvedValue('totp');
    findById.mockReset().mockResolvedValue({
      id: 'super-1',
      email: 'super@example.com',
      isActive: true,
      isLocalOnly: true,
      roleKeys: ['SUPER_ADMIN'],
    });
    revokeAll.mockReset().mockResolvedValue(1);
    invalidateUsers.mockReset().mockResolvedValue(undefined);
    findMany.mockReset();
    setCandidates([candidate('user-1'), candidate('user-2', true)]);
    updateMany.mockReset().mockImplementation(async ({ where }: FlagWrite) => {
      // The cutoff write is unconditional; the flag write is conditional on
      // `mustChangePassword: false`, so it reports 0 for an already-flagged row.
      if (where.mustChangePassword === undefined) return { count: 1 };
      const id = String(where.id);
      if (flagState.get(id) === true) return { count: 0 };
      flagState.set(id, true);
      return { count: 1 };
    });
    userSessionUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    factorDelete.mockReset().mockResolvedValue({ count: 0 });
    invalidateUsers.mockReset().mockResolvedValue(undefined);
    failingTargets = new Set();
    auditRows.length = 0;
    pendingAuditIntents.length = 0;
    auditOutage = false;
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
    expect(findById).toHaveBeenCalledWith('super-1');
    expect(result).toEqual({
      eligibleUsers: 2,
      changedUsers: 1,
      revokedSessions: 2,
      failedUsers: 0,
      pendingUsers: 0,
      status: 'COMPLETE',
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
    expect(userSessionUpdateMany).not.toHaveBeenCalled();
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
    setCandidates([candidate('user-1'), candidate('super-2', false, 'SUPER_ADMIN')]);

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
    expect(flagWrites()[0]!.where).toEqual({ id: 'user-1', mustChangePassword: false });
    expect(sessionWrites().map((args) => args.where)).toEqual([{ userId: 'user-1', revokedAt: null }]);
    expect(revokeAll).toHaveBeenCalledTimes(1);
    expect(revokeAll).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', actorUserId: 'super-1' }),
    );
  });

  it('blocks every eligible account durably before the accelerator runs, factor enrolment intact', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);

    const result = await createService().execute(caller, {});

    // The block is per-account, not one bulk write: each target got its own
    // cutoff and its own conditional flag write.
    // One conditional flag write per target; only the still-unflagged row flips,
    // which is what `changedUsers` reports.
    expect(flagWrites().map((args) => args.where.id)).toEqual(['user-1', 'user-2']);
    for (const write of flagWrites()) {
      expect(write.where).toMatchObject({ mustChangePassword: false });
      expect(write.data).toEqual({ mustChangePassword: true });
    }
    // The cutoff is unconditional (a repeat run must re-assert it) and clears the
    // exception another flow may have left behind.
    expect(cutoffWrites()).toHaveLength(2);
    expect(cutoffWrites().map((args) => args.where)).toEqual([{ id: 'user-1' }, { id: 'user-2' }]);
    for (const write of cutoffWrites()) {
      expect(write.data).toMatchObject({ tokensInvalidBeforeExceptJti: null });
      expect(write.data.tokensInvalidBefore).toBeInstanceOf(Date);
    }
    // Every live session row is revoked inside the same transaction.
    expect(sessionWrites()).toEqual([
      {
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedReason: 'admin', revokedByUserId: 'super-1' }),
      },
      {
        where: { userId: 'user-2', revokedAt: null },
        data: expect.objectContaining({ revokedReason: 'admin', revokedByUserId: 'super-1' }),
      },
    ]);
    // A forced password change is not an identity change: MFA survives.
    expect(factorDelete).not.toHaveBeenCalled();
    expect(revokeAll.mock.calls.map((call) => call[0].userId)).toEqual(['user-1', 'user-2']);
    expect(invalidateUsers).toHaveBeenCalledWith(['user-1', 'user-2']);
    expect(result).toEqual({
      eligibleUsers: 2,
      changedUsers: 1,
      revokedSessions: 2,
      failedUsers: 0,
      pendingUsers: 0,
      status: 'COMPLETE',
    });
  });

  it('keeps every target blocked when the session registry is down, and says PARTIAL', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    revokeAll.mockRejectedValue(new Error('session registry unavailable'));

    const result = await createService().execute(caller, {});

    // The durable half committed for both targets despite the outage: cutoff,
    // revoked rows and the flag are all there.
    expect(cutoffWrites()).toHaveLength(2);
    expect(sessionWrites()).toHaveLength(2);
    expect(flagWrites()).toHaveLength(2);
    // No target was left usable, so nothing counts as failed — but the run is not
    // a finished one either.
    expect(result).toEqual({
      eligibleUsers: 2,
      changedUsers: 1,
      revokedSessions: 2,
      failedUsers: 0,
      pendingUsers: 2,
      status: 'PARTIAL',
    });
    expect(auditRows[0]!.metadata).toMatchObject({ pendingUsers: 2, status: 'PARTIAL' });
  });

  it('rolls a target back whole when its block cannot be committed and reports it as failed', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    setCandidates([candidate('user-1'), candidate('user-2'), candidate('user-3')]);
    failingTargets = new Set(['user-2']);

    const result = await createService().execute(caller, {});

    expect(result).toEqual({
      eligibleUsers: 3,
      changedUsers: 2,
      revokedSessions: 2,
      failedUsers: 1,
      pendingUsers: 0,
      status: 'PARTIAL',
    });
    // The failed target is never "accelerated": it keeps working until a repeat run
    // commits its block, so pretending its session was revoked would be a lie.
    expect(revokeAll.mock.calls.map((call) => call[0].userId)).toEqual(['user-1', 'user-3']);
    expect(invalidateUsers).toHaveBeenCalledWith(['user-1', 'user-3']);
    expect(auditRows[0]!.metadata).toMatchObject({ failedUsers: 1, status: 'PARTIAL' });
  });

  it('is idempotent and converging: a repeat run re-asserts the cutoff, changes nothing, revokes the rest', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    // Nothing is left flagged, so the conditional write reports zero rows.
    setCandidates([candidate('user-1', true), candidate('user-2', true)]);

    const result = await createService().execute(caller, {});

    expect(flagWrites()).toHaveLength(2);
    expect(cutoffWrites()).toHaveLength(2);
    expect(revokeAll).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      eligibleUsers: 2,
      changedUsers: 0,
      revokedSessions: 2,
      failedUsers: 0,
      pendingUsers: 0,
      status: 'COMPLETE',
    });
  });

  it('journals one aggregate entry with counts, status and no identifiers', async () => {
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
      pendingUsers: 0,
      status: 'COMPLETE',
    });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('user-1');
    expect(serialized).not.toContain('user-2');
    expect(serialized).not.toContain('@');
    expect(serialized).not.toContain('123456');
  });

  /*
    W2.24 (`BA-security-03`): audit outage. An emergency reset must not fail
    because the audit table is unavailable, and the record must not vanish
    either: the run reports the same status, the event is parked once, and a
    replay after recovery produces exactly one correlated entry.
  */
  it('completes the reset during an audit outage and replays exactly one entry afterwards', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    auditOutage = true;

    const result = await createService().execute(caller, {});

    expect(result.status).toBe('COMPLETE');
    expect(auditRows).toHaveLength(0);
    expect(pendingAuditIntents).toHaveLength(1);
    expect(pendingAuditIntents[0]).toMatchObject({
      action: 'auth.admin_bulk_password_reset',
      entityId: 'super-1',
      actorUserId: 'super-1',
    });

    // Recovery: the parked intent is delivered, and delivering it twice is
    // still one row because the key belongs to the event, not to the attempt.
    auditOutage = false;
    const intent = pendingAuditIntents[0]!;
    await recordAuditEntry(prisma as never, intent as never);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: 'auth.admin_bulk_password_reset', entityId: 'super-1' });
    expect(auditRows[0]!.metadata).toMatchObject({ status: 'COMPLETE', changedUsers: 1 });
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
    the blocked set is exactly what the database query returned minus every
    SuperAdmin, the revocation carries the admin actor and the bulk reason, and
    no password (no hash, no temporary value) is written anywhere.
  */
  it('blocks only the local accounts on a mixed page, and writes no password', async () => {
    consumeFreshConfirmation.mockResolvedValue(true);
    setCandidates([
      candidate('user-1'),
      candidate('super-9', false, 'SUPER_ADMIN'),
      candidate('user-2', true),
    ]);

    const result = await createService().execute(caller, {});

    expect(result).toMatchObject({ eligibleUsers: 2, changedUsers: 1, failedUsers: 0 });
    // Exactly the two local accounts, never the SuperAdmin — in every write.
    expect(flagWrites().map((args) => args.where.id)).toEqual(['user-1', 'user-2']);
    expect(cutoffWrites().map((args) => args.where.id)).toEqual(['user-1', 'user-2']);
    expect(revokeAll.mock.calls.map((call) => call[0])).toEqual([
      { userId: 'user-1', reason: 'admin', actorUserId: 'super-1' },
      { userId: 'user-2', reason: 'admin', actorUserId: 'super-1' },
    ]);

    // Nothing in this action may carry a credential: the only user writes are the
    // flag and the cutoff, and no argument of any call mentions a hash or a
    // temporary password (the flag's own name is the expected mention).
    const writes = JSON.stringify(updateMany.mock.calls);
    expect(writes).not.toMatch(/localPasswordHash|passwordHash|temporaryPassword|bcrypt|argon/i);
    for (const write of flagWrites()) {
      expect(Object.keys(write.data)).toEqual(['mustChangePassword']);
    }
    for (const write of cutoffWrites()) {
      expect(Object.keys(write.data).sort()).toEqual([
        'tokensInvalidBefore',
        'tokensInvalidBeforeExceptJti',
      ]);
    }
    expect(Object.keys(sessionWrites()[0]!.data).sort()).toEqual([
      'revokedAt',
      'revokedByUserId',
      'revokedReason',
    ]);
  });
});
