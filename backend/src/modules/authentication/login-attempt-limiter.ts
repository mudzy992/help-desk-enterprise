import { createHash, createHmac, randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';
import { JwtSigningSecretLoader } from './jwt-signing-secret.loader';
import {
  SecurityRateLimitConfigLoader,
} from './security/security-rate-limit-config.loader';
import {
  LoginSecurityMetricsService,
} from './security/login-security-metrics.service';
import {
  defaultSecurityRateLimitConfig,
  type SecurityRateLimitConfig,
} from './security/security-rate-limit-config';

/**
 * Paket 5.4.0-b: the limits became configurable (`private.security.rateLimits.*`).
 * The exported shapes stay for the existing tests and defaults; the limiter
 * itself reads the values per request through the config loader.
 */
export const loginAttemptLimits = {
  maxFailures: defaultSecurityRateLimitConfig.otherMaxFailures,
  windowSeconds: defaultSecurityRateLimitConfig.otherWindowSeconds,
} as const;

export const passwordLoginLimits = {
  accountWindowSeconds: defaultSecurityRateLimitConfig.accountWindowSeconds,
  accountDelayStartsAfterFailures: defaultSecurityRateLimitConfig.accountDelayStartsAfterFailures,
  accountDelayBaseMilliseconds: defaultSecurityRateLimitConfig.accountDelayBaseMilliseconds,
  accountDelayMaxMilliseconds: defaultSecurityRateLimitConfig.accountDelayMaxMilliseconds,
  ipMaxFailures: defaultSecurityRateLimitConfig.ipMaxFailures,
  ipWindowSeconds: defaultSecurityRateLimitConfig.ipWindowSeconds,
} as const;

export type LoginAttemptStore = {
  count(key: string): Promise<number>;
  recordFailure(key: string, windowSeconds: number): Promise<number>;
  clear(key: string): Promise<void>;
  /** Reserves an account attempt atomically and returns its zero-based delay index. */
  beginAccountAttempt(key: string, attemptId: string, windowSeconds: number): Promise<number>;
  /** Finishes one reservation; only credential failures increment the failure count. */
  completeAccountAttempt(
    key: string,
    attemptId: string,
    outcome: 'credentialFailure' | 'success' | 'other',
  ): Promise<void>;
};

/** Legacy, non-PII keys (e.g. the constant Entra provider marker). */
export function loginAttemptKey(email: string, ip: string | undefined): string {
  return `auth:login-fail:${email.trim().toLowerCase()}:${(ip ?? 'unknown').trim()}`;
}

/** Account key is pseudonymous and stable across API replicas sharing the JWT secret. */
export function loginAccountAttemptKey(email: string, hmacSecret: string): string {
  const normalized = email.trim().toLowerCase();
  const digest = createHmac('sha256', hmacSecret)
    .update('help-desk-enterprise:login-rate-limit:account:v1\0')
    .update(normalized)
    .digest('hex');
  // v2 uses a Redis hash for in-flight attempt reservations; the versioned key
  // avoids colliding with any v1 string counters during a rolling deployment.
  return `auth:login-fail:account-state:v2:${digest}`;
}

/** IP key is also pseudonymous; a non-secret digest is used only if key storage is unavailable. */
export function loginIpAttemptKey(
  ip: string | undefined,
  hmacSecret?: string,
): string {
  const normalized = (ip ?? 'unknown').trim() || 'unknown';
  const digest = hmacSecret === undefined
    ? createHash('sha256').update(normalized).digest('hex')
    : createHmac('sha256', hmacSecret)
        .update('help-desk-enterprise:login-rate-limit:ip:v1\0')
        .update(normalized)
        .digest('hex');
  return `auth:login-fail:ip:${digest}`;
}

/**
 * Review 2026-09-25 (N1): `POST /auth/change-password` is authorised by a
 * short-lived password-change token only; failed (401) attempts are limited
 * per client IP with the same window as sign-in.
 */
export function changePasswordAttemptKey(ip: string | undefined): string {
  return `auth:change-password-fail:${(ip ?? 'unknown').trim()}`;
}

export function accountAttemptDelayMilliseconds(
  failureCount: number,
  limits: Pick<
    SecurityRateLimitConfig,
    'accountDelayStartsAfterFailures' | 'accountDelayBaseMilliseconds' | 'accountDelayMaxMilliseconds'
  > = defaultSecurityRateLimitConfig,
): number {
  const firstDelayedFailure = limits.accountDelayStartsAfterFailures;
  if (failureCount < firstDelayedFailure) return 0;
  const exponent = Math.min(failureCount - firstDelayedFailure, 30);
  return Math.min(
    limits.accountDelayBaseMilliseconds * 2 ** exponent,
    limits.accountDelayMaxMilliseconds,
  );
}

export function createTooManyLoginAttemptsException(
  retryAfterSeconds = loginAttemptLimits.windowSeconds,
): HttpException {
  return new HttpException(
    {
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Too many failed sign-in attempts, try again later',
      details: { retryAfterSeconds },
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function createMemoryLoginAttemptStore(now: () => number = Date.now): LoginAttemptStore {
  const entries = new Map<string, { count: number; expiresAt: number }>();
  const accountEntries = new Map<
    string,
    { failureCount: number; pendingIds: Set<string>; expiresAt: number }
  >();
  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry === undefined || entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  const liveAccount = (key: string) => {
    const entry = accountEntries.get(key);
    if (entry === undefined || entry.expiresAt <= now()) {
      accountEntries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    count: async (key) => liveAccount(key)?.failureCount ?? live(key)?.count ?? 0,
    recordFailure: async (key, windowSeconds) => {
      const entry = live(key) ?? { count: 0, expiresAt: now() + windowSeconds * 1000 };
      entry.count += 1;
      entries.set(key, entry);
      return entry.count;
    },
    clear: async (key) => {
      entries.delete(key);
      accountEntries.delete(key);
    },
    beginAccountAttempt: async (key, attemptId, windowSeconds) => {
      const entry = liveAccount(key) ?? {
        failureCount: 0,
        pendingIds: new Set<string>(),
        expiresAt: now() + windowSeconds * 1000,
      };
      const delayIndex = entry.failureCount + entry.pendingIds.size;
      entry.pendingIds.add(attemptId);
      accountEntries.set(key, entry);
      return delayIndex;
    },
    completeAccountAttempt: async (key, attemptId, outcome) => {
      const entry = liveAccount(key);
      if (entry === undefined || !entry.pendingIds.delete(attemptId)) {
        return;
      }
      if (outcome === 'credentialFailure') {
        entry.failureCount += 1;
      } else if (outcome === 'success') {
        entry.failureCount = 0;
      }
      if (entry.pendingIds.size === 0 && entry.failureCount === 0) {
        accountEntries.delete(key);
      } else {
        accountEntries.set(key, entry);
      }
    },
  };
}

/** Atomic fixed-window counter: expiry is set only for the first failure. */
export function createRedisLoginAttemptStore(redis: Redis): LoginAttemptStore {
  const incrementWithExpiry =
    "local count = redis.call('INCR', KEYS[1]); " +
    "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; " +
    'return count';
  const beginAccountAttempt = [
    "local failures = tonumber(redis.call('HGET', KEYS[1], 'failures') or '0')",
    "local pending = tonumber(redis.call('HGET', KEYS[1], 'pending') or '0')",
    'local delayIndex = failures + pending',
    "local attemptField = 'attempt:' .. ARGV[2]",
    "if redis.call('HSETNX', KEYS[1], attemptField, '1') == 1 then redis.call('HINCRBY', KEYS[1], 'pending', 1) end",
    "if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
    'return delayIndex',
  ].join('; ');
  const completeAccountAttempt = [
    "local attemptField = 'attempt:' .. ARGV[1]",
    'if redis.call(\'HDEL\', KEYS[1], attemptField) == 0 then return 0 end',
    "local pending = tonumber(redis.call('HGET', KEYS[1], 'pending') or '0')",
    "if pending > 0 then redis.call('HINCRBY', KEYS[1], 'pending', -1) end",
    "if ARGV[2] == 'credentialFailure' then redis.call('HINCRBY', KEYS[1], 'failures', 1) end",
    "if ARGV[2] == 'success' then redis.call('HSET', KEYS[1], 'failures', 0) end",
    "local remainingPending = tonumber(redis.call('HGET', KEYS[1], 'pending') or '0')",
    "local failures = tonumber(redis.call('HGET', KEYS[1], 'failures') or '0')",
    'if remainingPending <= 0 and failures <= 0 then redis.call(\'DEL\', KEYS[1]) end',
    'return 1',
  ].join('; ');
  return {
    count: async (key) => Number((await redis.get(key)) ?? 0),
    recordFailure: async (key, windowSeconds) =>
      Number(await redis.eval(incrementWithExpiry, 1, key, String(windowSeconds))),
    clear: async (key) => {
      await redis.del(key);
    },
    beginAccountAttempt: async (key, attemptId, windowSeconds) =>
      Number(await redis.eval(beginAccountAttempt, 1, key, String(windowSeconds), attemptId)),
    completeAccountAttempt: async (key, attemptId, outcome) => {
      await redis.eval(completeAccountAttempt, 1, key, attemptId, outcome);
    },
  };
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class LoginAttemptLimiter {
  private readonly logger = new Logger(LoginAttemptLimiter.name);
  private readonly store: LoginAttemptStore;

  constructor(
    @Optional() @Inject(redisTokens.client) redis?: Redis,
    @Optional() private readonly jwtSigningSecretLoader?: JwtSigningSecretLoader,
    @Optional() private readonly rateLimitConfigLoader?: SecurityRateLimitConfigLoader,
    @Optional() private readonly securityMetrics?: LoginSecurityMetricsService,
  ) {
    this.store =
      redis !== undefined && redis !== null
        ? createRedisLoginAttemptStore(redis)
        : createMemoryLoginAttemptStore();
  }

  /** Config per request: an admin change takes effect without a restart. */
  private async loadLimits(): Promise<SecurityRateLimitConfig> {
    if (this.rateLimitConfigLoader === undefined) return defaultSecurityRateLimitConfig;
    try {
      return await this.rateLimitConfigLoader.load();
    } catch (error) {
      this.logger.warn(`rate-limit config unavailable, using defaults: ${String(error)}`);
      return defaultSecurityRateLimitConfig;
    }
  }

  /**
   * Local password sign-in uses independent account and IP buckets. The
   * account is never locked: failures add a bounded delay, while only the
   * source IP can receive a temporary 429.
   */
  async guardPasswordLogin<T>(
    email: string,
    ip: string | undefined,
    login: () => Promise<T>,
  ): Promise<T> {
    const limits = await this.loadLimits();
    const secret = await this.loadHmacSecret();
    const accountKey = secret === null ? null : loginAccountAttemptKey(email, secret);
    const ipKey = loginIpAttemptKey(ip, secret ?? undefined);
    const ipFailures = await this.safe(() => this.store.count(ipKey), 0);
    if (ipFailures >= limits.ipMaxFailures) {
      await this.recordMetric('login-429');
      throw createTooManyLoginAttemptsException(limits.ipWindowSeconds);
    }
    const attemptId = accountKey === null ? null : randomUUID();
    const delayIndex =
      accountKey === null || attemptId === null
        ? 0
        : await this.safe(
            () =>
              this.store.beginAccountAttempt(
                accountKey,
                attemptId,
                limits.accountWindowSeconds,
              ),
            0,
          );
    const delay = accountAttemptDelayMilliseconds(delayIndex, limits);
    if (delay > 0) {
      await this.recordMetric('login-account-delays');
      await wait(delay);
    }

    let outcome: 'credentialFailure' | 'success' | 'other' = 'other';
    try {
      const result = await login();
      outcome = 'success';
      return result;
    } catch (error) {
      if (isCredentialFailure(error)) {
        outcome = 'credentialFailure';
        await this.safe(
          () => this.store.recordFailure(ipKey, limits.ipWindowSeconds),
          0,
        );
      }
      throw error;
    } finally {
      if (accountKey !== null && attemptId !== null) {
        // Reservation + completion is atomic in Redis, so concurrent attempts
        // share a distinct progressive-delay index without over-counting outages.
        await this.safe(
          () => this.store.completeAccountAttempt(accountKey, attemptId, outcome),
          undefined,
        );
      }
    }
  }

  /** Runs a legacy single-key guarded operation (Entra and change-password). */
  async guard<T>(key: string, login: () => Promise<T>): Promise<T> {
    const limits = await this.loadLimits();
    if ((await this.safe(() => this.store.count(key), 0)) >= limits.otherMaxFailures) {
      throw createTooManyLoginAttemptsException(limits.otherWindowSeconds);
    }
    try {
      const result = await login();
      await this.safe(() => this.store.clear(key), undefined);
      return result;
    } catch (error) {
      if (isCredentialFailure(error)) {
        await this.safe(
          () => this.store.recordFailure(key, limits.otherWindowSeconds),
          0,
        );
      }
      throw error;
    }
  }

  private async recordMetric(event: 'login-429' | 'login-account-delays'): Promise<void> {
    if (this.securityMetrics === undefined) return;
    await this.safe(() => this.securityMetrics!.record(event), undefined);
  }

  private async loadHmacSecret(): Promise<string | null> {
    if (this.jwtSigningSecretLoader === undefined) return null;
    try {
      return await this.jwtSigningSecretLoader.load();
    } catch (error) {
      // Do not fail sign-in because the rate-limit pseudonym key is unavailable.
      // The IP bucket still works with a non-secret digest; account delay fails open.
      this.logger.warn(`login limiter HMAC key unavailable, account delay failing open: ${String(error)}`);
      return null;
    }
  }

  private async safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.logger.warn(`login limiter store unavailable, failing open: ${String(error)}`);
      return fallback;
    }
  }
}

/** 401-type failures only; validation errors or outages do not count. */
function isCredentialFailure(error: unknown): boolean {
  if (error instanceof HttpException) {
    return error.getStatus() === HttpStatus.UNAUTHORIZED;
  }
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'INVALID_CREDENTIALS';
}
