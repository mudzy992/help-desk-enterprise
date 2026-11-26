import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { auditLogActions } from '../../audit-log/audit-log.constants';
import type { SessionRevokeReason } from './session-registry.service';
import { SessionRegistryService } from './session-registry.service';
import { AccountSecurityNotifier } from './account-security-notifier';
import { notificationTypes } from '../../notifications/notifications.constants';

/**
 * W2.22 (`BA-users-03`): the three identity/account transitions that move the
 * authentication boundary of an account used to leave credentials behind.
 *
 * `updateUser(isActive=false)`, `linkUserDirectoryIdentity` and
 * `unlinkUserDirectoryIdentity` changed **who may authenticate** without touching
 * the sessions or the local factors of the account: a deactivated user came back
 * with an unexpired refresh token, a freshly linked directory user kept a local
 * session, and an unlinked directory user kept a provider session next to the new
 * temporary password.
 *
 * The contract below is deliberately split in two halves:
 *
 * * `cutWithinTransaction` runs **inside the caller's transaction** and writes the
 *   durable part — the `tokensInvalidBefore` cutoff (W2.15), `revokedAt` on every
 *   live `UserSession`, and the deletion of the local factors (`UserMfa`,
 *   recovery codes, passkeys). A failure here rolls the transition back, so the
 *   API can never answer 2xx without a durable revoke.
 * * `afterCommit` does the volatile half — the Redis accelerator, the audit entry
 *   that names the transition, and the owner notification. It is logged, never
 *   thrown: the durable cutoff already denies the old tokens.
 */
export type AccountSecurityTransition = 'deactivated' | 'directory_linked' | 'directory_unlinked';

export type AccountSecurityCut = {
  readonly transition: AccountSecurityTransition;
  readonly cutoffAt: string;
  readonly sessions: number;
  readonly passkeys: number;
  readonly mfaFactors: number;
  readonly recoveryCodes: number;
};

export type AccountSecurityBoundaryPort = {
  readonly cutWithinTransaction: (
    transaction: Prisma.TransactionClient,
    input: { readonly userId: string; readonly actorUserId: string | null; readonly transition: AccountSecurityTransition },
  ) => Promise<AccountSecurityCut>;
  readonly afterCommit: (input: {
    readonly userId: string;
    readonly actorUserId: string | null;
    readonly cut: AccountSecurityCut;
  }) => Promise<void>;
};

/** Session revoke reason recorded on the rows, one per transition. */
export function sessionReasonForTransition(transition: AccountSecurityTransition): SessionRevokeReason {
  return transition === 'deactivated'
    ? 'deactivated'
    : transition === 'directory_linked'
      ? 'identity_link'
      : 'identity_unlink';
}

/**
 * The durable half. Everything here happens on the caller's transaction client, so
 * a deactivation and its revocation commit or disappear together.
 *
 * Policy (documented in `docs/backend/implementation/356-…`): a transition that
 * moves the identity or suspends the account ends the local factor lifecycle — the
 * user re-enrolls MFA after reactivation/re-link. Keeping a factor enrolled by the
 * previous identity holder is exactly the gap this finding describes.
 */
export async function cutAccountCredentials(
  transaction: Prisma.TransactionClient,
  input: { readonly userId: string; readonly actorUserId: string | null; readonly transition: AccountSecurityTransition },
): Promise<AccountSecurityCut> {
  const now = new Date();
  /*
    One statement sets the legacy-token cutoff and never leaves an exception behind:
    a previous `exceptJti` belonged to a session that must not survive this boundary.
  */
  await transaction.user.update({
    where: { id: input.userId },
    data: { tokensInvalidBefore: now, tokensInvalidBeforeExceptJti: null },
    select: { id: true },
  });
  const reason = sessionReasonForTransition(input.transition);
  const sessions = await transaction.userSession.updateMany({
    where: { userId: input.userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason, revokedByUserId: input.actorUserId },
  });
  const [passkeys, mfaFactors, recoveryCodes] = await Promise.all([
    transaction.userPasskeyCredential.deleteMany({ where: { userId: input.userId } }),
    transaction.userMfa.deleteMany({ where: { userId: input.userId } }),
    transaction.userMfaRecoveryCode.deleteMany({ where: { userId: input.userId } }),
  ]);
  return {
    transition: input.transition,
    cutoffAt: now.toISOString(),
    sessions: sessions.count,
    passkeys: passkeys.count,
    mfaFactors: mfaFactors.count,
    recoveryCodes: recoveryCodes.count,
  };
}

@Injectable()
export class AccountSecurityBoundaryService implements AccountSecurityBoundaryPort {
  private readonly logger = new Logger(AccountSecurityBoundaryService.name);

  constructor(
    private readonly sessionRegistry: SessionRegistryService,
    private readonly notifier: AccountSecurityNotifier,
  ) {}

  cutWithinTransaction(
    transaction: Prisma.TransactionClient,
    input: { readonly userId: string; readonly actorUserId: string | null; readonly transition: AccountSecurityTransition },
  ): Promise<AccountSecurityCut> {
    return cutAccountCredentials(transaction, input);
  }

  async afterCommit(input: {
    readonly userId: string;
    readonly actorUserId: string | null;
    readonly cut: AccountSecurityCut;
  }): Promise<void> {
    const { userId, actorUserId, cut } = input;
    /*
      The accelerated revocation marks the subject in Redis and re-asserts the
      cutoff. It is the volatile half: if Redis is down the durable cutoff still
      denies every token, so the transition is not reported as failed.
    */
    try {
      await this.sessionRegistry.revokeAll({
        userId,
        reason: sessionReasonForTransition(cut.transition),
        actorUserId,
      });
    } catch (error) {
      this.logger.warn(
        `accelerated revocation failed for ${cut.transition} on user ${userId}: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
    await this.notifier.audit(auditLogActions.authSecurityTransitionApplied, userId, actorUserId, {
      transition: cut.transition,
      cutoffAt: cut.cutoffAt,
      sessions: cut.sessions,
      passkeys: cut.passkeys,
      mfaFactors: cut.mfaFactors,
      /*
        A count, not a code — and deliberately not named `recoveryCodes`: the audit
        policy redacts any key matching `recovery.?code` (secret material), which
        turned this number into `[REDACTED]` and cost the entry its evidence. The
        PostgreSQL integration spec pins the surviving number.
      */
      recoveryFactors: cut.recoveryCodes,
    });
    const removedFactors = cut.passkeys + cut.mfaFactors + cut.recoveryCodes;
    if (removedFactors > 0) {
      // The owner has to know the second factor is gone before the next sign-in.
      await this.notifier.notify(
        userId,
        notificationTypes.accountMfaChanged,
        null,
        `security-transition:${userId}:${cut.transition}:${cut.cutoffAt}`,
      );
    }
  }
}
