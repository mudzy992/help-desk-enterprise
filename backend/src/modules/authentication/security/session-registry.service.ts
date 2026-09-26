import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { authenticationConstants } from '../authentication.constants';
import { auditLogActions } from '../../audit-log/audit-log.constants';
import { notificationTypes } from '../../notifications/notifications.constants';
import type { SignInContext } from '../authentication.types';
import { SessionTokenService } from '../session-token.service';
import type { AccountSecurityPolicy } from './account-security-policy.loader';
import { AccountSecurityNotifier } from './account-security-notifier';
import { truncateIpAddress } from './network-prefix';

export type SessionRevokeReason =
  | 'logout'
  | 'user'
  | 'admin'
  | 'password_change'
  | 'mfa_reset'
  | 'session_limit'
  | 'deactivated';

export type UserSessionView = {
  readonly id: string;
  readonly provider: string;
  readonly mfaMethod: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly current: boolean;
};

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const RETENTION_DAYS = 30;
const NEW_DEVICE_LOOKBACK_DAYS = 90;

/**
 * Paket 2.1 (M6): one row per sign-in. The id is the `sid` claim; revocation
 * is enforced through Redis (`auth:revoked-sid:*`) so the guard needs no
 * database read, the row is the durable record for the UI and the audit.
 */
@Injectable()
export class SessionRegistryService {
  private readonly logger = new Logger(SessionRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly notifier: AccountSecurityNotifier,
  ) {}

  async create(input: {
    readonly userId: string;
    readonly provider: 'local' | 'entra' | 'legacy';
    readonly mfaMethod: 'totp' | 'recovery' | null;
    readonly context: SignInContext;
    readonly policy: AccountSecurityPolicy;
    readonly isAdmin: boolean;
  }): Promise<{ readonly id: string }> {
    const now = new Date();
    const ipAddress = truncateIpAddress(input.context.ipAddress);
    const userAgent = input.context.userAgent?.slice(0, 512) ?? null;
    const isNewDevice =
      input.isAdmin && input.policy.sessionsNewDeviceAlert && input.provider !== 'legacy'
        ? await this.isNewDevice(input.userId, ipAddress, userAgent, now)
        : false;
    const session = await this.prisma.userSession.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        mfaMethod: input.mfaMethod,
        ipAddress,
        userAgent,
        expiresAt: new Date(now.getTime() + authenticationConstants.sessionTtlSeconds * 1000),
      },
      select: { id: true },
    });
    await this.enforceLimit(input.userId, session.id, input.policy.sessionsMaxPerUser);
    if (isNewDevice) {
      await this.notifier.notify(
        input.userId,
        notificationTypes.accountNewDevice,
        [userAgent ? summarizeUserAgent(userAgent) : null, ipAddress].filter(Boolean).join(' · ') || null,
        `new-device:${session.id}`,
      );
    }
    void this.prune(input.userId).catch(() => undefined);
    return session;
  }

  /** Refresh: extend and (at most every 5 min) record the last activity. */
  async touch(sessionId: string, context: SignInContext): Promise<void> {
    const now = Date.now();
    try {
      await this.prisma.userSession.updateMany({
        where: { id: sessionId, revokedAt: null, lastSeenAt: { lt: new Date(now - TOUCH_INTERVAL_MS) } },
        data: {
          lastSeenAt: new Date(now),
          expiresAt: new Date(now + authenticationConstants.sessionTtlSeconds * 1000),
          ipAddress: truncateIpAddress(context.ipAddress),
          userAgent: context.userAgent?.slice(0, 512) ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(`session touch failed: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }

  async list(userId: string, currentSessionId: string | null): Promise<UserSessionView[]> {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      mfaMethod: row.mfaMethod,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      current: row.id === currentSessionId,
    }));
  }

  /** Returns false when the session does not belong to the user. */
  async revoke(input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly reason: SessionRevokeReason;
    readonly actorUserId: string | null;
  }): Promise<boolean> {
    const result = await this.prisma.userSession.updateMany({
      where: { id: input.sessionId, userId: input.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: input.reason, revokedByUserId: input.actorUserId },
    });
    const owned = result.count > 0 || (await this.prisma.userSession.count({ where: { id: input.sessionId, userId: input.userId } })) > 0;
    if (!owned) return false;
    await this.sessionTokenService.revokeSession(input.sessionId);
    if (input.reason !== 'logout') {
      await this.notifier.audit(auditLogActions.authSessionRevoked, input.userId, input.actorUserId, {
        sessionId: input.sessionId,
        reason: input.reason,
      });
    }
    return true;
  }

  /**
   * Every session of the user ends, optionally except the caller's own. Without
   * an exception the per-user cutoff also ends tokens issued before the registry.
   */
  async revokeAll(input: {
    readonly userId: string;
    readonly reason: SessionRevokeReason;
    readonly actorUserId: string | null;
    readonly exceptSessionId?: string | null;
  }): Promise<number> {
    const active = await this.prisma.userSession.findMany({
      where: {
        userId: input.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(input.exceptSessionId ? { id: { not: input.exceptSessionId } } : {}),
      },
      select: { id: true },
    });
    if (active.length > 0) {
      await this.prisma.userSession.updateMany({
        where: { id: { in: active.map((row) => row.id) } },
        data: { revokedAt: new Date(), revokedReason: input.reason, revokedByUserId: input.actorUserId },
      });
      for (const row of active) {
        await this.sessionTokenService.revokeSession(row.id);
      }
    }
    if (!input.exceptSessionId) {
      await this.sessionTokenService.revokeAllForUser(input.userId);
    }
    await this.notifier.audit(auditLogActions.authSessionsRevokedAll, input.userId, input.actorUserId, {
      reason: input.reason,
      count: active.length,
      keptCurrent: Boolean(input.exceptSessionId),
    });
    return active.length;
  }

  private async enforceLimit(userId: string, newSessionId: string, maxPerUser: number): Promise<void> {
    if (maxPerUser <= 0) return;
    const active = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true },
    });
    const excess = active.filter((row) => row.id !== newSessionId).slice(Math.max(0, maxPerUser - 1));
    for (const row of excess) {
      await this.revoke({ userId, sessionId: row.id, reason: 'session_limit', actorUserId: null });
    }
  }

  private async isNewDevice(userId: string, ipAddress: string | null, userAgent: string | null, now: Date): Promise<boolean> {
    const since = new Date(now.getTime() - NEW_DEVICE_LOOKBACK_DAYS * 86_400_000);
    const known = await this.prisma.userSession.count({
      where: { userId, createdAt: { gte: since }, ipAddress, userAgent },
    });
    if (known > 0) return false;
    // The very first sign-in of an account is not a "new device" alert.
    const any = await this.prisma.userSession.count({ where: { userId } });
    return any > 0;
  }

  private async prune(userId: string): Promise<void> {
    await this.prisma.userSession.deleteMany({
      where: { userId, expiresAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } },
    });
  }
}

/** Short "Browser on OS" label for notifications (the UI has its own parser). */
export function summarizeUserAgent(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}
