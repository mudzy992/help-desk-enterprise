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
export type RevocationCheck = {
  jti: string | null;
  subjectId: string;
  issuedAt: number;
  /** Paket 2.1: session id (`sid`); null for tokens issued before the registry. */
  sessionId?: string | null;
};

export type SessionRevocationBackend = {
  isRevoked(input: RevocationCheck): Promise<boolean>;
  revokeToken(jti: string, ttlSeconds: number): Promise<void>;
  /** Paket 2.1: every token of one session (all refreshes) stops working. */
  revokeSession(sessionId: string, ttlSeconds: number): Promise<void>;
  revokeAllForUser(subjectId: string, nowSeconds: number, ttlSeconds: number): Promise<void>;
};

export function createMemorySessionRevocationBackend(
  now: () => number = Date.now,
): SessionRevocationBackend {
  const revoked = new Map<string, number>();
  const revokedSessions = new Map<string, number>();
  const validAfter = new Map<string, { at: number; expiresAt: number }>();
  return {
    isRevoked: async ({ jti, subjectId, issuedAt, sessionId }) => {
      const current = now();
      if (sessionId) {
        const until = revokedSessions.get(sessionId);
        if (until !== undefined && until > current) return true;
      }
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
    revokeSession: async (sessionId, ttlSeconds) => {
      revokedSessions.set(sessionId, now() + ttlSeconds * 1000);
    },
    revokeAllForUser: async (subjectId, nowSeconds, ttlSeconds) => {
      validAfter.set(subjectId, { at: nowSeconds, expiresAt: now() + ttlSeconds * 1000 });
    },
  };
}

function createRedisSessionRevocationBackend(redis: Redis): SessionRevocationBackend {
  return {
    isRevoked: async ({ jti, subjectId, issuedAt, sessionId }) => {
      // One round trip: jti, session and per-user cutoff in a single MGET.
      const [tokenRevoked, cutoff, sessionRevoked] = await redis.mget(
        jti === null ? 'auth:revoked-jti:-' : `auth:revoked-jti:${jti}`,
        `auth:sessions-valid-after:${subjectId}`,
        sessionId ? `auth:revoked-sid:${sessionId}` : 'auth:revoked-sid:-',
      );
      if (tokenRevoked !== null || sessionRevoked !== null) return true;
      return cutoff !== null && issuedAt < Number(cutoff);
    },
    revokeToken: async (jti, ttlSeconds) => {
      await redis.set(`auth:revoked-jti:${jti}`, '1', 'EX', Math.max(1, ttlSeconds));
    },
    revokeSession: async (sessionId, ttlSeconds) => {
      await redis.set(`auth:revoked-sid:${sessionId}`, '1', 'EX', Math.max(1, ttlSeconds));
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

  async isRevoked(input: RevocationCheck): Promise<boolean> {
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

  async revokeSession(sessionId: string, ttlSeconds: number): Promise<void> {
    await this.safe(() => this.backend.revokeSession(sessionId, ttlSeconds));
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
