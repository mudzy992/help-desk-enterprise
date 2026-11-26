import { auditLogActions } from '../../audit-log/audit-log.constants';
import {
  AccountSecurityBoundaryService,
  cutAccountCredentials,
  sessionReasonForTransition,
} from './account-security-boundary.service';

/*
  W2.22 (`BA-users-03`): the durable half must be provable on its own — the cutoff,
  the session rows and the local factors are written on the **caller's** transaction
  client, so a deactivation cannot commit without them.
*/
describe('cutAccountCredentials', () => {
  function transaction() {
    const update = jest.fn(async () => ({ id: 'user-1' }));
    return {
      update,
      transaction: {
        user: { update },
        userSession: { updateMany: jest.fn(async () => ({ count: 2 })) },
        userPasskeyCredential: { deleteMany: jest.fn(async () => ({ count: 1 })) },
        userMfa: { deleteMany: jest.fn(async () => ({ count: 1 })) },
        userMfaRecoveryCode: { deleteMany: jest.fn(async () => ({ count: 8 })) },
      },
    };
  }

  it('cuts the token cutoff, every live session and the local factors', async () => {
    const { transaction: tx } = transaction();
    const cut = await cutAccountCredentials(tx as never, {
      userId: 'user-1',
      actorUserId: 'admin-1',
      transition: 'deactivated',
    });

    // One statement: legacy tokens lose the exception list as well.
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokensInvalidBefore: expect.any(Date), tokensInvalidBeforeExceptJti: null },
      select: { id: true },
    });
    expect(tx.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: {
        revokedAt: expect.any(Date),
        revokedReason: 'deactivated',
        revokedByUserId: 'admin-1',
      },
    });
    expect(tx.userPasskeyCredential.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(tx.userMfa.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(tx.userMfaRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });

    expect(cut).toMatchObject({
      transition: 'deactivated',
      sessions: 2,
      passkeys: 1,
      mfaFactors: 1,
      recoveryCodes: 8,
    });
    expect(new Date(cut.cutoffAt).toISOString()).toBe(cut.cutoffAt);
  });

  it('uses one revoke reason per transition', async () => {
    expect(sessionReasonForTransition('deactivated')).toBe('deactivated');
    expect(sessionReasonForTransition('directory_linked')).toBe('identity_link');
    expect(sessionReasonForTransition('directory_unlinked')).toBe('identity_unlink');
  });
});

describe('AccountSecurityBoundaryService.afterCommit', () => {
  function service(overrides: { revokeAllThrows?: boolean } = {}) {
    const revokeAll = jest.fn(async () => {
      if (overrides.revokeAllThrows === true) throw new Error('redis down');
      return 2;
    });
    const notifier = { audit: jest.fn(async () => undefined), notify: jest.fn(async () => undefined) };
    const instance = new AccountSecurityBoundaryService(
      { revokeAll } as never,
      notifier as never,
    );
    return { instance, revokeAll, notifier };
  }

  const cut = {
    transition: 'directory_linked' as const,
    cutoffAt: '2026-10-29T10:00:00.000Z',
    sessions: 2,
    passkeys: 1,
    mfaFactors: 1,
    recoveryCodes: 8,
  };

  it('marks the accelerated revocation, audits the transition and notifies the owner', async () => {
    const { instance, revokeAll, notifier } = service();
    await instance.afterCommit({ userId: 'user-1', actorUserId: 'admin-1', cut });

    expect(revokeAll).toHaveBeenCalledWith({
      userId: 'user-1',
      reason: 'identity_link',
      actorUserId: 'admin-1',
    });
    expect(notifier.audit).toHaveBeenCalledWith(
      auditLogActions.authSecurityTransitionApplied,
      'user-1',
      'admin-1',
      {
        transition: 'directory_linked',
        cutoffAt: '2026-10-29T10:00:00.000Z',
        sessions: 2,
        passkeys: 1,
        mfaFactors: 1,
        // The audit key avoids the `recovery.?code` redaction pattern.
        recoveryFactors: 8,
      },
    );
    expect(notifier.notify).toHaveBeenCalledWith(
      'user-1',
      'account.mfaChanged',
      null,
      'security-transition:user-1:directory_linked:2026-10-29T10:00:00.000Z',
    );
  });

  it('stays silent for the owner when no factor was removed', async () => {
    const { instance, notifier } = service();
    await instance.afterCommit({
      userId: 'user-1',
      actorUserId: null,
      cut: { ...cut, passkeys: 0, mfaFactors: 0, recoveryCodes: 0 },
    });
    expect(notifier.audit).toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('does not fail the transition when the accelerator is down: the cutoff already denies', async () => {
    const { instance, notifier } = service({ revokeAllThrows: true });
    await expect(
      instance.afterCommit({ userId: 'user-1', actorUserId: null, cut }),
    ).resolves.toBeUndefined();
    expect(notifier.audit).toHaveBeenCalled();
  });
});
