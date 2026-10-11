import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../common/principal-context/principal-context-invalidator.service';
import { AuthenticationUserLoader } from '../authentication/authentication-user.loader';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { mapAccountSecurityError } from '../authentication/security/account-security.error';
import { MfaService } from '../authentication/security/mfa.service';
import { SessionRegistryService } from '../authentication/security/session-registry.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { IdentityPasskeyService } from './identity-passkey.service';

/*
  Paket 5.4.0-d (M5): the SuperAdmin "force every local account to change its
  password" action.

  What it does — and deliberately does not do:
    * it touches **no** password: no hash is read, written or generated and no
      temporary password is issued. It only raises `mustChangePassword`, so the
      next sign-in of every affected account is forced through the
      change-password screen (`AuthenticationService.completeLogin`);
    * it revokes every active session of every eligible account through the
      existing registry (sid rows plus the legacy cutoff), and invalidates the
      cached authorization context so nothing keeps working from a stale cache;
    * it is idempotent and resumable: the update is conditional on
      `mustChangePassword = false`, and a repeat call still verifies and
      revokes whatever sessions remain, so a run interrupted halfway through
      revocation is completed by running it again;
    * a partial failure is reported as a partial failure (`failedUsers`), never
      as a full success;
    * the aggregate audit entry carries counts only.
*/

/** Purpose-scoped step-up marker: a rate-limit marker can never be replayed here. */
export const bulkPasswordResetStepUpPurpose = 'bulk-password-reset';

export type BulkPasswordResetResult = {
  /** Local accounts the application really manages a password for (no SuperAdmin). */
  readonly eligibleUsers: number;
  /** Accounts whose flag actually flipped in this call (0 on a repeat call). */
  readonly changedUsers: number;
  /** Sessions revoked in this call, across every eligible account. */
  readonly revokedSessions: number;
  /** Accounts whose session revocation failed — the memory of a partial run. */
  readonly failedUsers: number;
};

@Injectable()
export class BulkPasswordResetService {
  private readonly logger = new Logger(BulkPasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mfaService: MfaService,
    private readonly identityPasskeyService: IdentityPasskeyService,
    private readonly userLoader: AuthenticationUserLoader,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly principalContextInvalidator: PrincipalContextInvalidator,
  ) {}

  async execute(
    caller: { readonly subjectId: string; readonly sessionId: string | null },
    input: { readonly code?: string },
  ): Promise<BulkPasswordResetResult> {
    await this.assertIdentityConfirmed(caller, input.code);

    const targets = await this.listEligibleUsers();
    const pending = targets.filter((user) => user.mustChangePassword !== true);

    let changedUsers = 0;
    if (pending.length > 0) {
      // Conditional update: a repeat call (or a racing caller) cannot flip the
      // same account twice and reports 0 changed users honestly.
      const updated = await this.prisma.user.updateMany({
        where: { id: { in: pending.map((user) => user.id) }, mustChangePassword: false },
        data: { mustChangePassword: true },
      });
      changedUsers = updated.count;
    }

    let revokedSessions = 0;
    let failedUsers = 0;
    for (const user of targets) {
      try {
        revokedSessions += await this.sessionRegistry.revokeAll({
          userId: user.id,
          reason: 'admin',
          actorUserId: caller.subjectId,
        });
      } catch {
        failedUsers += 1;
        this.logger.warn(
          'bulk password reset: session revocation failed for one account; continuing',
        );
      }
    }

    // Best effort and never throwing: a stale authorization cache must not keep
    // a revoked account working, but a cache outage must not fail the action.
    try {
      await this.principalContextInvalidator.invalidateUsers(
        targets.map((user) => user.id),
      );
    } catch {
      this.logger.warn(
        'bulk password reset: authorization cache invalidation failed; sessions are already revoked',
      );
    }

    await this.audit(caller.subjectId, {
      eligibleUsers: targets.length,
      changedUsers,
      revokedSessions,
      failedUsers,
    });

    return {
      eligibleUsers: targets.length,
      changedUsers,
      revokedSessions,
      failedUsers,
    };
  }

  /**
   * Proof of identity, stricter than the rate-limit endpoint on purpose:
   * a fresh passkey step-up marker for **this** purpose, or a current TOTP
   * code for an account that has TOTP enrolled. An account with neither is
   * refused — there is no "no second factor, proceed anyway" path here.
   */
  private async assertIdentityConfirmed(
    caller: { readonly subjectId: string; readonly sessionId: string | null },
    code: string | undefined,
  ): Promise<void> {
    const confirmedByPasskey =
      caller.sessionId !== null
        ? await this.identityPasskeyService.consumeFreshConfirmation(
            caller.sessionId,
            bulkPasswordResetStepUpPurpose,
          )
        : false;
    if (confirmedByPasskey) {
      return;
    }
    if (!(await this.mfaService.isEnabled(caller.subjectId))) {
      // A legacy token without a session id can never satisfy the passkey
      // branch, and without TOTP there is nothing else to verify.
      throw new UnauthorizedException({
        code: 'IDENTITY_CONFIRMATION_REQUIRED',
        method: 'totp',
      });
    }
    const subject = await this.userLoader.findById(caller.subjectId);
    if (subject === null) {
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND' });
    }
    await this.mfaService
      .verify(subject, code?.trim() ?? '')
      .catch(mapAccountSecurityError);
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
   * One aggregate entry. Only counts — never a password, a user id list, an
   * e-mail, an IP, a directory identifier, a TOTP code or an assertion.
   */
  private async audit(
    actorUserId: string,
    counts: {
      readonly eligibleUsers: number;
      readonly changedUsers: number;
      readonly revokedSessions: number;
      readonly failedUsers: number;
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
        } as never,
      });
    } catch {
      // The settings/registry-session trail is already written by the session
      // service; a failing audit row must not turn a completed action into an
      // error the admin would retry blindly.
    }
  }
}
