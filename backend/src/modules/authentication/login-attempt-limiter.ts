import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';

/**
 * Review 2026-09-25: `POST /auth/login` had no brute-force protection. After
 * `maxFailures` wrong passwords for the same e-mail from the same IP within
 * `windowSeconds` further attempts get 429 until the window expires; a
 * successful login clears the counter. Counters live in Redis so every API
 * replica sees them (in-memory fallback only when Redis is not wired, e.g.
 * unit tests). A Redis outage fails OPEN — nobody is locked out by it.
 *
 * IP: `request.ip`. Behind Coolify/Traefik that is the proxy unless Express
 * `trust proxy` is set (TRUST_PROXY=1), in which case the limit is effectively
 * per e-mail — still a brute-force stop, just coarser.
 */
export const loginAttemptLimits = {
  maxFailures: 5,
  windowSeconds: 15 * 60,
} as const;

export type LoginAttemptStore = {
  count(key: string): Promise<number>;
  recordFailure(key: string, windowSeconds: number): Promise<number>;
  clear(key: string): Promise<void>;
};

export function loginAttemptKey(email: string, ip: string | undefined): string {
  return `auth:login-fail:${email.trim().toLowerCase()}:${(ip ?? 'unknown').trim()}`;
}

export function createTooManyLoginAttemptsException(): HttpException {
  return new HttpException(
    {
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      message: 'Too many failed sign-in attempts, try again later',
      details: { retryAfterSeconds: loginAttemptLimits.windowSeconds },
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function createMemoryLoginAttemptStore(now: () => number = Date.now): LoginAttemptStore {
  const entries = new Map<string, { count: number; expiresAt: number }>();
  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry === undefined || entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    count: async (key) => live(key)?.count ?? 0,
    recordFailure: async (key, windowSeconds) => {
      const entry = live(key) ?? { count: 0, expiresAt: now() + windowSeconds * 1000 };
      entry.count += 1;
      entries.set(key, entry);
      return entry.count;
    },
    clear: async (key) => {
      entries.delete(key);
    },
  };
}

function createRedisLoginAttemptStore(redis: Redis): LoginAttemptStore {
  return {
    count: async (key) => Number((await redis.get(key)) ?? 0),
    recordFailure: async (key, windowSeconds) => {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      return count;
    },
    clear: async (key) => {
      await redis.del(key);
    },
  };
}

@Injectable()
export class LoginAttemptLimiter {
  private readonly logger = new Logger(LoginAttemptLimiter.name);
  private readonly store: LoginAttemptStore;

  constructor(@Optional() @Inject(redisTokens.client) redis?: Redis) {
    this.store =
      redis !== undefined && redis !== null
        ? createRedisLoginAttemptStore(redis)
        : createMemoryLoginAttemptStore();
  }

  /** Runs `login`; throws 429 before it when the key is locked out. */
  async guard<T>(key: string, login: () => Promise<T>): Promise<T> {
    if ((await this.safe(() => this.store.count(key), 0)) >= loginAttemptLimits.maxFailures) {
      throw createTooManyLoginAttemptsException();
    }
    try {
      const result = await login();
      await this.safe(() => this.store.clear(key), undefined);
      return result;
    } catch (error) {
      if (isCredentialFailure(error)) {
        await this.safe(
          () => this.store.recordFailure(key, loginAttemptLimits.windowSeconds),
          0,
        );
      }
      throw error;
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
