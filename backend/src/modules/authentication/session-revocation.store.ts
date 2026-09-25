import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { redisTokens } from '../../common/redis/redis.tokens';

/**
 * Review 2026-09-25 (S1/S2): session JWTs could not be revoked — "sign out"
 * only cleared the browser and a stolen token lived for 8 h, also after a
 * password change. Two Redis records close that:
 *
 *   auth:revoked-jti:{jti}          one token (logout, refresh rotation);
 *                                   TTL = the token's remaining lifetime
 *   auth:sessions-valid-after:{sub} every token of a user issued before this
 *                                   second (password change); TTL = session TTL
 *
 * Tokens are short (1 h), so the records never outlive what they protect. A
 * Redis outage fails OPEN (logged) — sessions keep working rather than
 * everybody being signed out; the 1 h expiry still bounds the exposure.
 */
export type SessionRevocationBackend = {
  isRevoked(input: { jti: string | null; subjectId: string; issuedAt: number }): Promise<boolean>;
  revokeToken(jti: string, ttlSeconds: number): Promise<void>;
  revokeAllForUser(subjectId: string, nowSeconds: number, ttlSeconds: number): Promise<void>;
};

export function createMemorySessionRevocationBackend(
  now: () => number = Date.now,
): SessionRevocationBackend {
  const revoked = new Map<string, number>();
  const validAfter = new Map<string, { at: number; expiresAt: number }>();
  return {
    isRevoked: async ({ jti, subjectId, issuedAt }) => {
      const current = now();
      if (jti !== null) {
        const until = revoked.get(jti);
        if (until !== undefined && until > current) return true;
      }
      const cutoff = validAfter.get(subjectId);
      return cutoff !== undefined && cutoff.expiresAt > current && issuedAt < cutoff.at;
    },
    revokeToken: async (jti, ttlSeconds) => {
      revoked.set(jti, now() + ttlSeconds * 1000);
    },
    revokeAllForUser: async (subjectId, nowSeconds, ttlSeconds) => {
      validAfter.set(subjectId, { at: nowSeconds, expiresAt: now() + ttlSeconds * 1000 });
    },
  };
}

function createRedisSessionRevocationBackend(redis: Redis): SessionRevocationBackend {
  return {
    isRevoked: async ({ jti, subjectId, issuedAt }) => {
      const [tokenRevoked, cutoff] = await Promise.all([
        jti === null ? Promise.resolve(0) : redis.exists(`auth:revoked-jti:${jti}`),
        redis.get(`auth:sessions-valid-after:${subjectId}`),
      ]);
      if (tokenRevoked > 0) return true;
      return cutoff !== null && issuedAt < Number(cutoff);
    },
    revokeToken: async (jti, ttlSeconds) => {
      await redis.set(`auth:revoked-jti:${jti}`, '1', 'EX', Math.max(1, ttlSeconds));
    },
    revokeAllForUser: async (subjectId, nowSeconds, ttlSeconds) => {
      await redis.set(
        `auth:sessions-valid-after:${subjectId}`,
        String(nowSeconds),
        'EX',
        Math.max(1, ttlSeconds),
      );
    },
  };
}

@Injectable()
export class SessionRevocationStore {
  private readonly logger = new Logger(SessionRevocationStore.name);
  private readonly backend: SessionRevocationBackend;

  constructor(@Optional() @Inject(redisTokens.client) redis?: Redis) {
    this.backend =
      redis !== undefined && redis !== null
        ? createRedisSessionRevocationBackend(redis)
        : createMemorySessionRevocationBackend();
  }

  async isRevoked(input: { jti: string | null; subjectId: string; issuedAt: number }): Promise<boolean> {
    try {
      return await this.backend.isRevoked(input);
    } catch (error) {
      this.logger.warn(`session revocation check unavailable, failing open: ${String(error)}`);
      return false;
    }
  }

  async revokeToken(jti: string | null, expiresAt: number): Promise<void> {
    if (jti === null) return;
    const ttl = expiresAt - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return;
    await this.safe(() => this.backend.revokeToken(jti, ttl));
  }

  async revokeAllForUser(subjectId: string, sessionTtlSeconds: number): Promise<void> {
    await this.safe(() =>
      this.backend.revokeAllForUser(subjectId, Math.floor(Date.now() / 1000), sessionTtlSeconds),
    );
  }

  private async safe(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.warn(`session revocation write failed: ${String(error)}`);
    }
  }
}
