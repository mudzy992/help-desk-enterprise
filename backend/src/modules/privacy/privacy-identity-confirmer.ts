import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountSecurityError, mapAccountSecurityError } from '../authentication/security/account-security.error';
import { MfaService } from '../authentication/security/mfa.service';
import { IdentityPasskeyService } from '../security/identity-passkey.service';
import type { PrivacyActor } from './privacy-actor';
import { privacyErrorCodes, privacyLimits } from './privacy.constants';
import { PrivacyError } from './privacy.error';

/**
 * Paket 2.6 (§5.1, §6.1): irreversible or sensitive actions (anonymization,
 * downloading an export) need a fresh proof of identity:
 * - an account with a fresh passkey step-up (Paket 5.4.0-a) confirms without
 *   typing a code — the marker is single-use and at most 2 minutes old;
 * - an account with MFA enabled types a current TOTP (or recovery) code;
 * - an account without local MFA (SSO — Entra enforces its own MFA) must have
 *   signed in within the last 15 minutes.
 */
@Injectable()
export class PrivacyIdentityConfirmer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfaService: MfaService,
    private readonly identityPasskeyService: IdentityPasskeyService,
  ) {}

  async confirm(
    actor: PrivacyActor,
    code: string | undefined,
    now: Date = new Date(),
  ): Promise<'passkey' | 'mfa' | 'fresh_session'> {
    const userId = actor.principal.subjectId;
    // Paket 5.4.0-a: a fresh passkey step-up marker is a proof of identity.
    // Consumed even if the caller's action fails afterwards — a marker is
    // one confirmation, not a grace period.
    if (actor.sessionId !== null) {
      const confirmedByPasskey = await this.identityPasskeyService.consumeFreshConfirmation(
        actor.sessionId,
        'identity-confirmation',
      );
      if (confirmedByPasskey) return 'passkey';
    }
    if (await this.mfaService.isEnabled(userId)) {
      const trimmed = code?.trim() ?? '';
      if (trimmed.length === 0) {
        throw new PrivacyError(privacyErrorCodes.identityConfirmationRequired, { method: 'mfa' });
      }
      const subject = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          localPasswordHash: true,
          entraObjectId: true,
          userRoles: { select: { role: { select: { key: true } } } },
        },
      });
      if (subject === null) throw new PrivacyError(privacyErrorCodes.identityConfirmationFailed);
      try {
        await this.mfaService.verify(
          {
            id: subject.id,
            email: subject.email,
            localPasswordHash: subject.localPasswordHash,
            entraObjectId: subject.entraObjectId,
            roleKeys: subject.userRoles.map((row) => row.role.key),
          },
          trimmed,
          now,
        );
      } catch (error) {
        // Only a wrong or reused code is "confirmation failed". A server-side
        // MFA problem (e.g. MFA_UNAVAILABLE after MFA_ENCRYPTION_KEY changed)
        // must not look like a typo — it surfaces as its own 503.
        if (error instanceof AccountSecurityError && error.code === 'MFA_INVALID_CODE') {
          throw new PrivacyError(privacyErrorCodes.identityConfirmationFailed, { method: 'mfa' });
        }
        if (error instanceof AccountSecurityError) mapAccountSecurityError(error);
        throw error;
      }
      return 'mfa';
    }
    const session =
      actor.sessionId === null
        ? null
        : await this.prisma.userSession.findUnique({
            where: { id: actor.sessionId },
            select: { userId: true, createdAt: true, revokedAt: true },
          });
    if (
      session === null ||
      session.userId !== userId ||
      session.revokedAt !== null ||
      now.getTime() - session.createdAt.getTime() > privacyLimits.freshSessionMs
    ) {
      throw new PrivacyError(privacyErrorCodes.identityConfirmationRequired, { method: 'fresh_session' });
    }
    return 'fresh_session';
  }
}
