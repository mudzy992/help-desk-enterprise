import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
import { appendAuditLog } from '../audit-log/append-audit-log';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { JsonValue } from '../change-log/change-log.types';
import type { HibpPasswordChecker } from '../authentication/security/hibp-password-checker';
import { recordUserChange, type UserChangeAction } from './record-user-change';
import { hashLocalPassword } from '../authentication/hash-local-password';
import { generateTemporaryPassword } from './generate-temporary-password';
import { sendTemporaryPasswordEmail } from './send-temporary-password-email';
import { UsersError } from './users.error';
import type { TemporaryPasswordDelivery } from './users.types';

export type IssuedTemporaryPassword = {
  readonly temporaryPassword: string | null;
  readonly temporaryPasswordDelivery: TemporaryPasswordDelivery;
};

/**
 * Paket 5.4.0-d (M5): how many fresh candidates are drawn before the reset is
 * refused. A 20-character random candidate from the 66-character alphabet has
 * a vanishing chance of being in the corpus at all, so exhausting these
 * attempts means the check itself is unusable — the account is then left
 * untouched instead of being handed a leaked password.
 */
export const temporaryPasswordHibpAttempts = 5;

/**
 * Paket 5.4.0-d (M5): the candidate is verified **before** it is hashed and
 * stored. Only a candidate that is not in the Pwned Passwords corpus (or one
 * the check could not judge — fail-open) ever reaches `hashLocalPassword`.
 */
export async function generateUncompromisedTemporaryPassword(
  hibpChecker?: HibpPasswordChecker,
): Promise<string> {
  for (let attempt = 0; attempt < temporaryPasswordHibpAttempts; attempt += 1) {
    const candidate = generateTemporaryPassword();
    if (hibpChecker === undefined) return candidate;
    const verdict = await hibpChecker.check(candidate);
    if (verdict !== 'pwned') return candidate;
  }
  throw new UsersError('TEMPORARY_PASSWORD_GENERATION_FAILED');
}

export async function issueTemporaryPasswordForUser(input: {
  readonly prisma: PrismaService;
  readonly settingsService: SettingsService;
  readonly mailTransport: MailTransport;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  /** Paket 5.4.0-d (M5): rejects a compromised candidate before hashing it. */
  readonly hibpChecker?: HibpPasswordChecker;
  readonly beforePasswordUpdate?: (transaction: Prisma.TransactionClient) => Promise<void>;
  readonly audit?: {
    readonly action: UserChangeAction;
    readonly actorUserId: string | null;
    readonly requestId: string | null;
    readonly metadata: JsonValue;
    readonly organizationalUnitId?: string | null;
  };
  /**
   * Paket 5.4.0-d (M6): an admin reset additionally records
   * `auth.password_reset_must_change` — exactly once per reset, in the same
   * transaction as the password write. No password or delivery content is part
   * of the entry; the caller passes only the reason.
   */
  readonly mustChangeAudit?: { readonly reason: string };
}): Promise<IssuedTemporaryPassword> {
  const temporaryPassword = await generateUncompromisedTemporaryPassword(input.hibpChecker);
  const localPasswordHash = await hashLocalPassword(temporaryPassword);
  await input.prisma.$transaction(async (transaction) => {
    if (input.beforePasswordUpdate !== undefined) {
      await input.beforePasswordUpdate(transaction);
    }
    await transaction.user.update({
      where: { id: input.userId },
      data: {
        localPasswordHash,
        mustChangePassword: true,
        isLocalOnly: true,
      },
    });
    if (input.audit !== undefined) {
      await recordUserChange(transaction as unknown as AuditLogWriteClient, {
        action: input.audit.action,
        entityId: input.userId,
        actorUserId: input.audit.actorUserId,
        requestId: input.audit.requestId,
        metadata: input.audit.metadata,
        organizationalUnitId: input.audit.organizationalUnitId,
      });
    }
    if (input.mustChangeAudit !== undefined) {
      await appendAuditLog(transaction as unknown as AuditLogWriteClient, {
        action: auditLogActions.authPasswordResetMustChange,
        entityType: auditLogEntityTypes.user,
        entityId: input.userId,
        actorUserId: input.audit?.actorUserId ?? null,
        requestId: input.audit?.requestId ?? null,
        organizationalUnitId: input.audit?.organizationalUnitId ?? null,
        metadata: {
          reason: input.mustChangeAudit.reason,
          status: 'must_change',
        } as never,
      });
    }
  });
  const emailed = await trySendTemporaryPassword({
    settingsService: input.settingsService,
    mailTransport: input.mailTransport,
    toAddress: input.email,
    displayName: input.displayName,
    temporaryPassword,
  });
  return {
    temporaryPassword: emailed ? null : temporaryPassword,
    temporaryPasswordDelivery: emailed ? 'email' : 'ui',
  };
}

async function trySendTemporaryPassword(input: {
  readonly settingsService: SettingsService;
  readonly mailTransport: MailTransport;
  readonly toAddress: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
}): Promise<boolean> {
  // Nightly 2026-10-10 (E2E 37/38): reserved addresses never receive test
  // mail — they always get the password back in the response (UI delivery),
  // even when SMTP is configured. Defaults to the RFC 2606 reserved domain.
  if (isReservedNoEmailAddress(input.toAddress)) return false;
  try {
    return await sendTemporaryPasswordEmail(input);
  } catch {
    return false;
  }
}

/** Domains listed here (comma-separated) always get UI password delivery. */
export function isReservedNoEmailAddress(
  email: string,
  domainsCsv: string = process.env.RESERVED_NO_EMAIL_DOMAINS ?? 'example.com',
): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  if (domain.length === 0) return false;
  return domainsCsv
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .includes(domain);
}
