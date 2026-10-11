import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions } from '../../audit-log/audit-log.constants';
import { notificationTypes } from '../../notifications/notifications.constants';
import { hashLocalPassword } from '../hash-local-password';
import { verifyLocalPassword } from '../verify-local-password';
import { AccountSecurityError } from './account-security.error';
import { AccountSecurityNotifier } from './account-security-notifier';
import { AccountSecurityPolicyLoader } from './account-security-policy.loader';
import { HibpPasswordChecker, hibpViolation } from './hibp-password-checker';
import { checkPassword } from './password-policy';

/**
 * Paket 2.1 (M7): the one place a local password is set by its owner —
 * policy (length, blocklist), history and `passwordChangedAt`.
 *
 * Paket 5.4.0-d (M5): it is also the one place the online Pwned Passwords
 * check runs for owner-set passwords. Both the voluntary change and the
 * forced/must-change flow reach it through `assertAcceptable`, so neither can
 * store a password found in a breach corpus.
 */
@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyLoader: AccountSecurityPolicyLoader,
    private readonly notifier: AccountSecurityNotifier,
    // Optional so older unit tests can build the service without a network
    // transport; the module always provides the real checker.
    @Optional() private readonly hibpChecker?: HibpPasswordChecker,
  ) {}

  async assertAcceptable(userId: string, email: string, newPassword: string): Promise<void> {
    const policy = await this.policyLoader.load();
    const violations = checkPassword(newPassword, email, {
      minLength: policy.passwordMinLength,
      maxLength: policy.passwordMaxLength,
      blocklistEnabled: policy.passwordBlocklistEnabled,
      organisationWords: policy.passwordOrganisationWords,
    });
    if (violations.length > 0) {
      throw new AccountSecurityError('INVALID_PASSWORD', violations);
    }
    if (policy.passwordHistoryCount > 0) {
      const [current, history] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId }, select: { localPasswordHash: true } }),
        this.prisma.userPasswordHistory.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: policy.passwordHistoryCount,
          select: { passwordHash: true },
        }),
      ]);
      const hashes = [current?.localPasswordHash, ...history.map((row) => row.passwordHash)].filter(
        (hash): hash is string => typeof hash === 'string',
      );
      for (const hash of hashes.slice(0, policy.passwordHistoryCount)) {
        if (await verifyLocalPassword(newPassword, hash)) {
          throw new AccountSecurityError('PASSWORD_REUSED');
        }
      }
    }
    // Paket 5.4.0-d (M5): the Pwned Passwords check runs last — the offline
    // rules and the history answer first, so the network is asked only about a
    // candidate that could actually be stored. `unavailable` fails open (the
    // checker logs and counts the skip); only a confirmed hit is a violation.
    if (this.hibpChecker !== undefined) {
      const verdict = await this.hibpChecker.check(newPassword);
      if (verdict === 'pwned') {
        throw new AccountSecurityError('INVALID_PASSWORD', [hibpViolation]);
      }
    }
  }

  /** Stores the new password; the previous hash goes to the history. */
  async apply(userId: string, newPassword: string, actorUserId: string | null): Promise<void> {
    const policy = await this.policyLoader.load();
    const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { localPasswordHash: true } });
    const localPasswordHash = await hashLocalPassword(newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      if (current?.localPasswordHash && policy.passwordHistoryCount > 0) {
        await transaction.userPasswordHistory.create({ data: { userId, passwordHash: current.localPasswordHash } });
        const stale = await transaction.userPasswordHistory.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip: policy.passwordHistoryCount,
          select: { id: true },
        });
        if (stale.length > 0) {
          await transaction.userPasswordHistory.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
        }
      }
      await transaction.user.update({
        where: { id: userId },
        data: { localPasswordHash, mustChangePassword: false, passwordChangedAt: now },
      });
    });
    await this.notifier.audit(auditLogActions.authPasswordChanged, userId, actorUserId);
    await this.notifier.notify(userId, notificationTypes.accountPasswordChanged, null, `password-changed:${userId}:${now.getTime()}`);
  }

  async verifyCurrent(userId: string, currentPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { localPasswordHash: true } });
    if (!user?.localPasswordHash) {
      throw new AccountSecurityError('LOCAL_PASSWORD_NOT_AVAILABLE');
    }
    if (!(await verifyLocalPassword(currentPassword, user.localPasswordHash))) {
      throw new AccountSecurityError('CURRENT_PASSWORD_INVALID');
    }
  }
}
