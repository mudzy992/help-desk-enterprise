import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { SessionRegistryService } from '../authentication/security/session-registry.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { StepUpPolicyService } from './step-up-policy.service';

/*
  Paket 5.4.0-d (M5): the SuperAdmin "force every local account to change its
  password" action.

  What it does — and deliberately does not do:
    * it touches **no** password: no hash is read, written or generated and no
      temporary password is issued. It only raises `mustChangePassword`, so the
      next sign-in of every affected account is forced through the
      change-password screen (`AuthenticationService.completeLogin`);
    * it ends the authentication boundary of every eligible account **durably and
      first**: `tokensInvalidBefore`, `revokedAt`/`revokedReason` on every live
      `UserSession` row and the `mustChangePassword` flag are written in one
      transaction per target. Only afterwards does the Redis accelerator run, so
      a Redis outage cannot leave a target usable (W2.23, `BA-security-02`);
    * unlike W2.22's identity transitions it never deletes a second factor: a
      forced password change is not an identity change, so MFA stays enrolled;
    * it is idempotent and resumable: the flag write is conditional on
      `mustChangePassword = false`, and a repeat call still re-asserts the cutoff
      and revokes whatever sessions remain, so a run that ended `PARTIAL` is
      finished by running it again;
    * a partial run is never reported as a full success: `status` is `PARTIAL`
      with the per-target counters (`failedUsers` — not blocked, still usable;
      `pendingUsers` — blocked, accelerator pending), and the endpoint answers
      `202` instead of `200`;
    * the aggregate audit entry carries counts and the status only.
*/

/** Purpose-scoped step-up marker: a rate-limit marker can never be replayed here. */
export const bulkPasswordResetStepUpPurpose = 'bulk-password-reset';

/**
 * `COMPLETE` — every target is durably blocked *and* its accelerator ran.
 * `PARTIAL` — at least one target needs a repeat run; the HTTP answer is `202`.
 */
export type BulkPasswordResetStatus = 'COMPLETE' | 'PARTIAL';

export type BulkPasswordResetResult = {
  /** Local accounts the application really manages a password for (no SuperAdmin). */
  readonly eligibleUsers: number;
  /** Accounts whose flag actually flipped in this call (0 on a repeat call). */
  readonly changedUsers: number;
  /** Session rows revoked in this call, across every eligible account. */
  readonly revokedSessions: number;
  /**
   * Accounts the durable block could **not** be committed for. Their commit was
   * rolled back whole, so they keep their previous state and stay usable until a
   * repeat run succeeds — this is the count that must never be reported as 200.
   */
  readonly failedUsers: number;
  /**
   * Accounts already blocked durably whose volatile half (Redis accelerator /
   * authorization-cache invalidation) failed. Not a security gap: the cutoff and
   * the revoked rows already deny every token.
   */
  readonly pendingUsers: number;
  readonly status: BulkPasswordResetStatus;
};

@Injectable()
export class BulkPasswordResetService {
  private readonly logger = new Logger(BulkPasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stepUpPolicy: StepUpPolicyService,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly principalContextInvalidator: PrincipalContextInvalidator,
  ) {}

  async execute(
    caller: { readonly subjectId: string; readonly sessionId: string | null },
    input: { readonly code?: string },
  ): Promise<BulkPasswordResetResult> {
    await this.stepUpPolicy.assertConfirmed({
      caller,
      purpose: bulkPasswordResetStepUpPurpose,
      code: input.code,
      requireLocalSuperAdmin: true,
    });

    const targets = await this.listEligibleUsers();

    /*
      Phase 1 — the enforcement half, per target, in its own transaction. This is
      the order the finding asks for: the boundary moves before any registry
      cleanup, so an injected registry outage can only leave the *accelerator*
      behind, never a usable session.
    */
    let changedUsers = 0;
    let revokedSessions = 0;
    let failedUsers = 0;
    const blocked: string[] = [];
    for (const target of targets) {
      try {
        const block = await this.prisma.$transaction((transaction) =>
          this.blockWithinTransaction(transaction, target.id, caller.subjectId),
        );
        changedUsers += block.flagged ? 1 : 0;
        revokedSessions += block.sessions;
        blocked.push(target.id);
      } catch {
        // The transaction rolled back whole: no half-blocked account, and the
        // target keeps working exactly as before — which is why it is counted
        // separately from a failed accelerator.
        failedUsers += 1;
        this.logger.warn(
          'bulk password reset: durable block failed for one account and was rolled back; it stays usable until a repeat run',
        );
      }
    }

    /*
      Phase 2 — the volatile half. `revokeAll` re-asserts the cutoff in Redis and
      marks the subject there; it is an accelerator on top of the committed state
      and its failure is counted, never thrown.
    */
    let pendingUsers = 0;
    for (const userId of blocked) {
      try {
        await this.sessionRegistry.revokeAll({
          userId,
          reason: 'admin',
          actorUserId: caller.subjectId,
        });
      } catch {
        pendingUsers += 1;
        this.logger.warn(
          'bulk password reset: accelerated revocation failed for one account; its durable cutoff already denies every token',
        );
      }
    }

    // Best effort and never throwing: a stale authorization cache must not keep
    // a blocked account working, but a cache outage must not fail the action.
    try {
      await this.principalContextInvalidator.invalidateUsers(blocked);
    } catch {
      this.logger.warn(
        'bulk password reset: authorization cache invalidation failed; the durable cutoff is already committed',
      );
    }

    // Honest terminal state: anything that needs a repeat run is `PARTIAL`, and the
    // controller answers 202 for it. Only a run where every target is blocked and
    // every accelerator ran is a `COMPLETE` (200).
    const status: BulkPasswordResetStatus =
      failedUsers === 0 && pendingUsers === 0 ? 'COMPLETE' : 'PARTIAL';
    const result: BulkPasswordResetResult = {
      eligibleUsers: targets.length,
      changedUsers,
      revokedSessions,
      failedUsers,
      pendingUsers,
      status,
    };
    await this.audit(caller.subjectId, result);
    return result;
  }

  /**
   * The durable block for one target: cutoff, live session rows and the flag, all
   * on the caller's transaction client. Nothing here deletes a factor — a forced
   * password change must not cost the user their MFA enrolment (W2.22's
   * `cutAccountCredentials` is for identity transitions, not for this action).
   */
  private async blockWithinTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    actorUserId: string,
  ): Promise<{ readonly flagged: boolean; readonly sessions: number }> {
    const now = new Date();
    // Conditional flag write: a repeat call (or a racing caller) cannot flip the
    // same account twice and reports 0 changed users honestly.
    const flagged = await transaction.user.updateMany({
      where: { id: userId, mustChangePassword: false },
      data: { mustChangePassword: true },
    });
    // One statement sets the legacy-token cutoff and drops any `exceptJti` left
    // behind by another flow — after a forced reset there is no exception.
    await transaction.user.updateMany({
      where: { id: userId },
      data: { tokensInvalidBefore: now, tokensInvalidBeforeExceptJti: null },
    });
    const sessions = await transaction.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'admin', revokedByUserId: actorUserId },
    });
    return { flagged: flagged.count === 1, sessions: sessions.count };
  }

  /**
   * Accounts the application itself manages a local password for, minus every
   * SuperAdmin. Defence in depth: `isLocalOnly` **and** a stored hash **and**
   * no Entra/directory identity **and** no anonymization mark must all hold.
   */
  private async listEligibleUsers(): Promise<
    readonly { readonly id: string; readonly mustChangePassword: boolean }[]
  > {
    const candidates = await this.prisma.user.findMany({
      where: {
        isActive: true,
        isLocalOnly: true,
        localPasswordHash: { not: null },
        entraObjectId: null,
        directoryObjectGuid: null,
        anonymizedAt: null,
      },
      select: {
        id: true,
        mustChangePassword: true,
        userRoles: { select: { role: { select: { key: true } } } },
      },
    });
    return candidates
      .filter(
        (user) =>
          !user.userRoles.some(
            (userRole) => userRole.role.key === authorizationRoleKeys.superAdmin,
          ),
      )
      .map((user) => ({ id: user.id, mustChangePassword: user.mustChangePassword }));
  }

  /**
   * One aggregate entry. Only counts and the status — never a password, a user id
   * list, an e-mail, an IP, a directory identifier, a TOTP code or an assertion.
   */
  private async audit(
    actorUserId: string,
    counts: Omit<BulkPasswordResetResult, 'eligibleUsers'> & {
      readonly eligibleUsers: number;
    },
  ): Promise<void> {
    try {
      await recordAuditEntry(this.prisma, {
        action: auditLogActions.authAdminBulkPasswordReset,
        entityType: auditLogEntityTypes.user,
        entityId: actorUserId,
        actorUserId,
        metadata: {
          eligibleUsers: counts.eligibleUsers,
          changedUsers: counts.changedUsers,
          revokedSessions: counts.revokedSessions,
          failedUsers: counts.failedUsers,
          pendingUsers: counts.pendingUsers,
          status: counts.status,
        } as never,
      });
    } catch {
      // The settings/registry-session trail is already written by the session
      // service; a failing audit row must not turn a completed action into an
      // error the admin would retry blindly.
    }
  }
}
