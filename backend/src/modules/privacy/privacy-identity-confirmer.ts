import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountSecurityError } from '../authentication/security/account-security.error';
import { MfaService } from '../authentication/security/mfa.service';
import type { PrivacyActor } from './privacy-actor';
import { privacyErrorCodes, privacyLimits } from './privacy.constants';
import { PrivacyError } from './privacy.error';

/**
 * Paket 2.6 (§5.1, §6.1): irreversible or sensitive actions (anonymization,
 * downloading an export) need a fresh proof of identity:
 * - an account with MFA enabled types a current TOTP (or recovery) code;
 * - an account without local MFA (SSO — Entra enforces its own MFA) must have
 *   signed in within the last 15 minutes.
 */
@Injectable()
export class PrivacyIdentityConfirmer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfaService: MfaService,
  ) {}

  async confirm(actor: PrivacyActor, code: string | undefined, now: Date = new Date()): Promise<'mfa' | 'fresh_session'> {
    const userId = actor.principal.subjectId;
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
        if (error instanceof AccountSecurityError) {
          throw new PrivacyError(privacyErrorCodes.identityConfirmationFailed, { method: 'mfa' });
        }
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
