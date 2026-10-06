import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions } from '../../audit-log/audit-log.constants';
import { notificationTypes } from '../../notifications/notifications.constants';
import { AccountSecurityError } from './account-security.error';
import { AccountSecurityNotifier } from './account-security-notifier';
import type { AccountSecurityPolicy } from './account-security-policy.loader';
import {
  type MfaFlow,
  type MfaRequirement,
  resolveMfaFlow,
  resolveMfaRequirement,
} from './account-security-rules';
import {
  decryptMfaSecretWithRotation,
  encryptMfaSecret,
  MfaEncryptionKeyMissingError,
  readMfaEncryptionKey,
  readPreviousMfaEncryptionKey,
} from './mfa-secret-cipher';
import { generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode } from './recovery-codes';
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from './totp';

const ENROLLMENT_TTL_MS = 15 * 60 * 1000;
/** A reused pending secret keeps at least this long to be confirmed. */
const ENROLLMENT_REUSE_MARGIN_MS = 2 * 60 * 1000;

export type MfaSubject = {
  readonly id: string;
  readonly email: string;
  readonly roleKeys: readonly string[];
  readonly localPasswordHash: string | null;
  readonly entraObjectId: string | null;
};

export type MfaStatus = {
  readonly requirement: MfaRequirement;
  readonly enabled: boolean;
  readonly enabledAt: string | null;
  readonly recoveryCodesRemaining: number;
  readonly serverConfigured: boolean;
};

/** Paket 2.1 (M1–M5): TOTP enrollment, verification, recovery and reset. */
const mfaLogger = new Logger('MfaService');

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: AccountSecurityNotifier,
  ) {}

  requirementFor(subject: MfaSubject, policy: AccountSecurityPolicy): MfaRequirement {
    return resolveMfaRequirement(
      { roleKeys: subject.roleKeys, hasLocalPassword: subject.localPasswordHash !== null, entraObjectId: subject.entraObjectId },
      policy,
    );
  }

  /** Paket 5.1 (M2 #1): what the sign-in flow does with the second factor. */
  flowFor(subject: MfaSubject, policy: AccountSecurityPolicy, isEnrolled: boolean): MfaFlow {
    return resolveMfaFlow(
      {
        roleKeys: subject.roleKeys,
        hasLocalPassword: subject.localPasswordHash !== null,
        entraObjectId: subject.entraObjectId,
      },
      policy,
      isEnrolled,
    );
  }

  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.prisma.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
    return row?.enabledAt != null;
  }

  async status(subject: MfaSubject, policy: AccountSecurityPolicy): Promise<MfaStatus> {
    const [row, remaining] = await Promise.all([
      this.prisma.userMfa.findUnique({ where: { userId: subject.id }, select: { enabledAt: true } }),
      this.prisma.userMfaRecoveryCode.count({ where: { userId: subject.id, usedAt: null } }),
    ]);
    return {
      requirement: this.requirementFor(subject, policy),
      enabled: row?.enabledAt != null,
      enabledAt: row?.enabledAt?.toISOString() ?? null,
      recoveryCodesRemaining: remaining,
      serverConfigured: readMfaEncryptionKey() !== null,
    };
  }

  async startEnrollment(subject: MfaSubject, policy: AccountSecurityPolicy): Promise<{ secret: string; otpauthUri: string }> {
    if (this.requirementFor(subject, policy) === 'unavailable') {
      throw new AccountSecurityError('MFA_NOT_AVAILABLE');
    }
    if (await this.isEnabled(subject.id)) {
      throw new AccountSecurityError('MFA_ALREADY_ENABLED');
    }
    // Idempotent and race-free while a pending secret is valid: a second
    // start (React StrictMode double mount, reload, second tab) must not
    // replace a secret the user may already have scanned. Before this, the QR
    // on screen and the stored secret could differ, so no code ever matched.
    // Only the first writer stores a secret; everyone returns what is stored.
    const now = new Date();
    const reusableSince = new Date(now.getTime() - (ENROLLMENT_TTL_MS - ENROLLMENT_REUSE_MARGIN_MS));
    const pendingSecretEncrypted = this.encrypt(generateTotpSecret());
    const written = await this.prisma.userMfa.updateMany({
      where: {
        userId: subject.id,
        enabledAt: null,
        OR: [{ pendingSecretEncrypted: null }, { pendingCreatedAt: null }, { pendingCreatedAt: { lt: reusableSince } }],
      },
      data: { pendingSecretEncrypted, pendingCreatedAt: now },
    });
    if (written.count === 0) {
      try {
        await this.prisma.userMfa.create({ data: { userId: subject.id, pendingSecretEncrypted, pendingCreatedAt: now } });
      } catch (error) {
        // P2002: a parallel start created the row first — use its secret.
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
    const stored = await this.prisma.userMfa.findUnique({ where: { userId: subject.id } });
    if (!stored?.pendingSecretEncrypted) throw new AccountSecurityError('MFA_ENROLLMENT_EXPIRED');
    const secret = this.decrypt(stored.pendingSecretEncrypted);
    return {
      secret,
      otpauthUri: buildOtpauthUri({ issuer: policy.mfaIssuerName, accountName: subject.email, base32Secret: secret }),
    };
  }

  /** Confirms the pending secret with a first code; returns the recovery codes (shown once). */
  async confirmEnrollment(subject: MfaSubject, code: string, now: Date = new Date()): Promise<string[]> {
    const row = await this.prisma.userMfa.findUnique({ where: { userId: subject.id } });
    if (row?.enabledAt != null) {
      throw new AccountSecurityError('MFA_ALREADY_ENABLED');
    }
    if (!row?.pendingSecretEncrypted || !row.pendingCreatedAt || now.getTime() - row.pendingCreatedAt.getTime() > ENROLLMENT_TTL_MS) {
      throw new AccountSecurityError('MFA_ENROLLMENT_EXPIRED');
    }
    const secret = this.decrypt(row.pendingSecretEncrypted);
    const step = verifyTotp({ base32Secret: secret, code, nowMilliseconds: now.getTime(), lastUsedStep: null });
    if (step === null) {
      throw new AccountSecurityError('MFA_INVALID_CODE');
    }
    const codes = generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.userMfa.update({
        where: { userId: subject.id },
        data: {
          secretEncrypted: row.pendingSecretEncrypted,
          enabledAt: now,
          lastUsedStep: BigInt(step),
          lastUsedAt: now,
          pendingSecretEncrypted: null,
          pendingCreatedAt: null,
        },
      }),
      this.prisma.userMfaRecoveryCode.deleteMany({ where: { userId: subject.id } }),
      this.prisma.userMfaRecoveryCode.createMany({
        data: codes.map((value) => ({ userId: subject.id, codeHash: hashRecoveryCode(value) })),
      }),
    ]);
    await this.notifier.audit(auditLogActions.authMfaEnrolled, subject.id, subject.id);
    await this.notifier.notify(subject.id, notificationTypes.accountMfaChanged, null, `mfa-enabled:${subject.id}:${now.getTime()}`);
    return codes;
  }

  /** Second factor at sign-in: a TOTP code or a recovery code. */
  async verify(subject: MfaSubject, code: string, now: Date = new Date()): Promise<'totp' | 'recovery'> {
    const row = await this.prisma.userMfa.findUnique({ where: { userId: subject.id } });
    if (row?.enabledAt == null || !row.secretEncrypted) {
      throw new AccountSecurityError('MFA_NOT_ENABLED');
    }
    if (looksLikeRecoveryCode(code)) {
      return this.useRecoveryCode(subject, code, now);
    }
    const lastUsedStep = row.lastUsedStep === null ? null : Number(row.lastUsedStep);
    const step = verifyTotp({
      base32Secret: this.decrypt(row.secretEncrypted),
      code,
      nowMilliseconds: now.getTime(),
      lastUsedStep,
    });
    if (step === null) {
      throw new AccountSecurityError('MFA_INVALID_CODE');
    }
    // Compare-and-set on the step: two parallel requests with one code → one wins.
    const updated = await this.prisma.userMfa.updateMany({
      where: { userId: subject.id, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }] },
      data: { lastUsedStep: BigInt(step), lastUsedAt: now },
    });
    if (updated.count === 0) {
      throw new AccountSecurityError('MFA_INVALID_CODE');
    }
    return 'totp';
  }

  async disable(subject: MfaSubject, policy: AccountSecurityPolicy, code: string): Promise<void> {
    if (this.requirementFor(subject, policy) === 'required') {
      throw new AccountSecurityError('MFA_REQUIRED_CANNOT_DISABLE');
    }
    await this.verify(subject, code);
    await this.clear(subject.id);
    await this.notifier.audit(auditLogActions.authMfaDisabled, subject.id, subject.id);
    await this.notifier.notify(subject.id, notificationTypes.accountMfaChanged, null, `mfa-disabled:${subject.id}:${Date.now()}`);
  }

  async regenerateRecoveryCodes(subject: MfaSubject, code: string): Promise<string[]> {
    const method = await this.verify(subject, code);
    if (method !== 'totp') {
      // A recovery code cannot mint new recovery codes.
      throw new AccountSecurityError('MFA_INVALID_CODE');
    }
    const codes = generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.userMfaRecoveryCode.deleteMany({ where: { userId: subject.id } }),
      this.prisma.userMfaRecoveryCode.createMany({
        data: codes.map((value) => ({ userId: subject.id, codeHash: hashRecoveryCode(value) })),
      }),
    ]);
    await this.notifier.audit(auditLogActions.authMfaRecoveryRegenerated, subject.id, subject.id);
    return codes;
  }

  /** Reset by an administrator or the server CLI; the caller checks permissions. */
  async reset(targetUserId: string, actorUserId: string | null, reason: string, via: 'admin' | 'server'): Promise<void> {
    await this.clear(targetUserId);
    await this.notifier.audit(auditLogActions.authMfaReset, targetUserId, actorUserId, { reason, via });
    await this.notifier.notify(targetUserId, notificationTypes.accountMfaChanged, null, `mfa-reset:${targetUserId}:${Date.now()}`);
  }

  private async useRecoveryCode(subject: MfaSubject, code: string, now: Date): Promise<'recovery'> {
    const used = await this.prisma.userMfaRecoveryCode.updateMany({
      where: { userId: subject.id, codeHash: hashRecoveryCode(code), usedAt: null },
      data: { usedAt: now },
    });
    if (used.count === 0) {
      throw new AccountSecurityError('MFA_INVALID_CODE');
    }
    const remaining = await this.prisma.userMfaRecoveryCode.count({ where: { userId: subject.id, usedAt: null } });
    await this.notifier.audit(auditLogActions.authMfaRecoveryUsed, subject.id, subject.id, { remaining });
    await this.notifier.notify(subject.id, notificationTypes.accountRecoveryCodeUsed, null, `mfa-recovery:${subject.id}:${now.getTime()}`);
    return 'recovery';
  }

  private async clear(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userMfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.userMfa.deleteMany({ where: { userId } }),
    ]);
  }

  private encrypt(secret: string): string {
    try {
      return encryptMfaSecret(secret, readMfaEncryptionKey());
    } catch (error) {
      if (error instanceof MfaEncryptionKeyMissingError) throw new AccountSecurityError('MFA_UNAVAILABLE');
      throw error;
    }
  }

  private decrypt(stored: string): string {
    try {
      return decryptMfaSecretWithRotation(stored, readMfaEncryptionKey(), readPreviousMfaEncryptionKey()).plain;
    } catch (error) {
      // Never log the secret; the reason tells a missing key from a changed one.
      mfaLogger.error(
        readMfaEncryptionKey() === null
          ? 'MFA secret cannot be decrypted: MFA_ENCRYPTION_KEY is missing or not 32 bytes'
          : `MFA secret cannot be decrypted (MFA_ENCRYPTION_KEY changed since enrollment?): ${(error as Error).message}`,
      );
      throw new AccountSecurityError('MFA_UNAVAILABLE');
    }
  }
}
