import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  organizationalUnitCatalogueRevisionId,
  publishOrganizationalUnitCatalogueRevision,
} from '../../common/request-context/catalogue-revision-probe';
import { redisTokens } from '../../common/redis/redis.tokens';
import type { PrincipalAuthoritySnapshot } from '../../common/principal-context/principal-context.types';
import {
  publishSocketSessionInvalidation,
  type SocketSessionInvalidation,
} from '../../common/security/socket-session-invalidation';

/**
 * Review 2026-09-25 (S1/S2): session JWTs could not be revoked — "sign out"
 * only cleared the browser and a stolen token lived for 8 h, also after a
 * password change. Two Redis records close that:
 *
 *   auth:revoked-jti:{jti}          one token (logout, refresh rotation);
 *                                   TTL = the token's remaining lifetime
 *   auth:sessions-valid-after:{sub} cutoff for old sid and legacy no-sid tokens;
 *                                   may exempt the caller's sid/jti; TTL = session TTL
 *
 * Tokens are short (1 h), so the records never outlive what they protect. A
 * Verification fails closed when Redis is unavailable. Revocation writes are
 * best effort because the durable registry row and periodic socket re-check
 * remain independent safety fences.
 */
export type RevocationCheck = {
  jti: string | null;
  subjectId: string;
  issuedAt: number;
  /** Paket 2.1: session id (`sid`); null for tokens issued before the registry. */
  sessionId?: string | null;
};

/** One row of the durable session + user authority read (perf kapija 2026-10-29). */
type DurableSessionAuthorityRow = {
  readonly subjectId: string;
  readonly authzVersion: number;
  readonly isActive: boolean;
  readonly mustChangePassword: boolean;
  /** Catalogue-OJ revision carried by the same statement; `null` on a fresh DB. */
  readonly catalogueRevision: bigint | number | string | null;
};

/**
 * The passenger value is a hint for the request-scoped OJ cache, never an
 * authority of its own: an unreadable value only means the cache falls back to
 * its own read (`W2.11` behaviour), so a malformed value is ignored silently.
 */
function publishSessionCatalogueRevision(revision: bigint | number | string | null): void {
  try {
    if (typeof revision === 'bigint') {
      publishOrganizationalUnitCatalogueRevision(revision);
      return;
    }
    if (typeof revision === 'number' && Number.isFinite(revision)) {
      publishOrganizationalUnitCatalogueRevision(BigInt(Math.trunc(revision)));
      return;
    }
    if (typeof revision === 'string' && /^\d+$/.test(revision)) {
      publishOrganizationalUnitCatalogueRevision(BigInt(revision));
    }
  } catch {
    // A passenger value that cannot be published must not change the decision.
  }
}

export type SessionRevocationExceptions = {
  /** Preserve every refreshed token tied to the current registry session. */
  readonly sessionId?: string | null;
  /** Preserve only this legacy token when the caller has no registry `sid`. */
  readonly jti?: string | null;
};

type StoredSessionCutoff = {
  readonly at: number;
  readonly exceptSessionId: string | null;
  readonly exceptJti: string | null;
};

function parseStoredSessionCutoff(raw: string): StoredSessionCutoff | null {
  const legacyAt = Number(raw);
  if (Number.isFinite(legacyAt)) {
    return { at: legacyAt, exceptSessionId: null, exceptJti: null };
  }
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof value.at !== 'number' ||
      !Number.isFinite(value.at) ||
      (value.exceptSessionId !== undefined &&
        value.exceptSessionId !== null &&
        typeof value.exceptSessionId !== 'string') ||
      (value.exceptJti !== undefined && value.exceptJti !== null && typeof value.exceptJti !== 'string')
    ) {
      return null;
    }
    return {
      at: value.at,
      exceptSessionId: typeof value.exceptSessionId === 'string' ? value.exceptSessionId : null,
      exceptJti: typeof value.exceptJti === 'string' ? value.exceptJti : null,
    };
  } catch {
    return null;
  }
}

/**
 * W2.15 (`BA-authentication-02`): a legacy token is dead once the user row carries
 * a cutoff at or after its `iat`, unless that cutoff was written by a "revoke
 * others" call that exempted this exact token. Seconds, like the JWT itself; the
 * legacy comparison includes the cutoff second, matching the Redis backend.
 */
function isBelowDurableLegacyCutoff(
  input: RevocationCheck,
  cutoff: Date | null | undefined,
  exceptJti: string | null | undefined,
): boolean {
  if (cutoff === null || cutoff === undefined) {
    return false;
  }
  if (exceptJti !== null && exceptJti !== undefined && input.jti !== null && input.jti === exceptJti) {
    return false;
  }
  return input.issuedAt <= Math.floor(cutoff.getTime() / 1000);
}

export type SessionRevocationCheckResult = {
  readonly revoked: boolean;
  readonly durableAuthority?: PrincipalAuthoritySnapshot;
};

export type SessionRevocationBackend = {
  isRevoked(input: RevocationCheck): Promise<boolean>;
  revokeToken(jti: string, ttlSeconds: number): Promise<void>;
  /** Paket 2.1: every token of one session (all refreshes) stops working. */
  revokeSession(sessionId: string, ttlSeconds: number): Promise<void>;
  revokeAllForUser(
    subjectId: string,
    nowSeconds: number,
    ttlSeconds: number,
    exceptions?: SessionRevocationExceptions,
  ): Promise<void>;
};

export function createMemorySessionRevocationBackend(
  now: () => number = Date.now,
): SessionRevocationBackend {
  const revoked = new Map<string, number>();
  const revokedSessions = new Map<string, number>();
  const validAfter = new Map<
    string,
    { at: number; expiresAt: number; exceptSessionId: string | null; exceptJti: string | null }
  >();
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
      if (cutoff === undefined || cutoff.expiresAt <= current) return false;
      if (sessionId !== null && sessionId !== undefined && sessionId === cutoff.exceptSessionId) return false;
      if (
        (sessionId === null || sessionId === undefined) &&
        jti !== null &&
        jti === cutoff.exceptJti
      ) {
        return false;
      }
      // `sid` sessions are revoked explicitly; strict seconds fallback keeps a
      // fresh sid issued in the same second valid. Legacy no-sid tokens cannot
      // distinguish that boundary, so include the cutoff second itself.
      return sessionId === null || sessionId === undefined
        ? issuedAt <= cutoff.at
        : issuedAt < cutoff.at;
    },
    revokeToken: async (jti, ttlSeconds) => {
      revoked.set(jti, now() + ttlSeconds * 1000);
    },
    revokeSession: async (sessionId, ttlSeconds) => {
      revokedSessions.set(sessionId, now() + ttlSeconds * 1000);
    },
    revokeAllForUser: async (subjectId, nowSeconds, ttlSeconds, exceptions) => {
      validAfter.set(subjectId, {
        at: nowSeconds,
        expiresAt: now() + ttlSeconds * 1000,
        exceptSessionId: exceptions?.sessionId ?? null,
        exceptJti: exceptions?.jti ?? null,
      });
    },
  };
}

export function createRedisSessionRevocationBackend(redis: Redis): SessionRevocationBackend {
  return {
    isRevoked: async ({ jti, subjectId, issuedAt, sessionId }) => {
      // One round trip: jti, session and per-user cutoff in a single MGET.
      const [tokenRevoked, cutoff, sessionRevoked] = await redis.mget(
        jti === null ? 'auth:revoked-jti:-' : `auth:revoked-jti:${jti}`,
        `auth:sessions-valid-after:${subjectId}`,
        sessionId ? `auth:revoked-sid:${sessionId}` : 'auth:revoked-sid:-',
      );
      if (tokenRevoked !== null || sessionRevoked !== null) return true;
      if (cutoff === null) return false;
      const stored = parseStoredSessionCutoff(cutoff);
      if (stored === null) return false;
      if (sessionId !== null && sessionId !== undefined && sessionId === stored.exceptSessionId) return false;
      if (
        (sessionId === null || sessionId === undefined) &&
        jti !== null &&
        jti === stored.exceptJti
      ) {
        return false;
      }
      return sessionId === null || sessionId === undefined
        ? issuedAt <= stored.at
        : issuedAt < stored.at;
    },
    revokeToken: async (jti, ttlSeconds) => {
      await redis.set(`auth:revoked-jti:${jti}`, '1', 'EX', Math.max(1, ttlSeconds));
    },
    revokeSession: async (sessionId, ttlSeconds) => {
      await redis.set(`auth:revoked-sid:${sessionId}`, '1', 'EX', Math.max(1, ttlSeconds));
    },
    revokeAllForUser: async (subjectId, nowSeconds, ttlSeconds, exceptions) => {
      await redis.set(
        `auth:sessions-valid-after:${subjectId}`,
        JSON.stringify({
          at: nowSeconds,
          exceptSessionId: exceptions?.sessionId ?? null,
          exceptJti: exceptions?.jti ?? null,
        }),
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

  constructor(
    @Optional() @Inject(redisTokens.client) private readonly redis?: Redis,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.backend =
      redis !== undefined && redis !== null
        ? createRedisSessionRevocationBackend(redis)
        : createMemorySessionRevocationBackend();
  }

  async isRevoked(input: RevocationCheck): Promise<boolean> {
    return (await this.check(input)).revoked;
  }

  /**
   * Confirms the durable session and user authority in one joined SQL read for
   * `sid` tokens; legacy no-`sid` tokens get a direct user authority read. The
   * returned snapshot lets the request principal-context cache reuse the same
   * per-request database check instead of issuing a second user query.
   *
   * Perf kapija (2026-10-29): the statement also carries the catalogue-OJ
   * revision (`W2.11`), so authorization reads a fresh revision without a second
   * `SELECT` per request. The value is published to the request scope only; a
   * missing or unreadable passenger leaves `W2.11` behaviour unchanged.
   */
  async check(input: RevocationCheck): Promise<SessionRevocationCheckResult> {
    let durableAuthority: PrincipalAuthoritySnapshot | undefined;
    // A registry session is durable PostgreSQL state. Check it on every request:
    // Redis may accelerate token/cutoff checks, but an outage or a stale replica
    // must never resurrect a revoked session on another API instance.
    if (input.sessionId && this.prisma !== undefined) {
      try {
        // Perf kapija (2026-10-29): the catalogue-OJ revision rides along in this
        // statement instead of costing its own `SELECT` per request. One row, one
        // round trip; `expiresAt` is compared in UTC so the comparison cannot
        // depend on the session time zone.
        const rows = await this.prisma.$queryRaw<DurableSessionAuthorityRow[]>`
          SELECT
            s."userId" AS "subjectId",
            u."authzVersion" AS "authzVersion",
            u."isActive" AS "isActive",
            u."mustChangePassword" AS "mustChangePassword",
            (
              SELECT r."revision"
              FROM "OrganizationalUnitCatalogRevision" r
              WHERE r."id" = ${organizationalUnitCatalogueRevisionId}
            ) AS "catalogueRevision"
          FROM "UserSession" s
          JOIN "User" u ON u."id" = s."userId"
          WHERE s."id" = ${input.sessionId}
            AND s."userId" = ${input.subjectId}
            AND s."revokedAt" IS NULL
            AND s."expiresAt" > (${new Date()}::timestamptz AT TIME ZONE 'UTC')
          LIMIT 1
        `;
        const active = rows[0];
        if (active === undefined || active.subjectId !== input.subjectId) {
          return { revoked: true };
        }
        publishSessionCatalogueRevision(active.catalogueRevision);
        durableAuthority = {
          subjectId: active.subjectId,
          authzVersion: active.authzVersion,
          isActive: active.isActive,
          mustChangePassword: active.mustChangePassword,
        };
        if (!durableAuthority.isActive || durableAuthority.mustChangePassword) {
          return { revoked: true };
        }
      } catch (error) {
        this.logger.error(`session authority unavailable, failing closed: ${String(error)}`);
        return { revoked: true };
      }
    } else if (this.prisma !== undefined) {
      // Legacy access tokens have no registry `sid`. They still need a fresh
      // durable account/authz snapshot so logout/password/deactivation and the
      // socket lease check do not depend on an optional cache entry.
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: input.subjectId },
          select: {
            id: true,
            authzVersion: true,
            isActive: true,
            mustChangePassword: true,
            // W2.15 (`BA-authentication-02`): the durable half of the hybrid
            // strategy. Two more columns on the row this statement already reads
            // — no second query, and a lost Redis write cannot extend the token.
            tokensInvalidBefore: true,
            tokensInvalidBeforeExceptJti: true,
          },
        });
        if (user === null || user.id !== input.subjectId) {
          return { revoked: true };
        }
        durableAuthority = {
          subjectId: user.id,
          authzVersion: user.authzVersion,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
        };
        if (!durableAuthority.isActive || durableAuthority.mustChangePassword) {
          return { revoked: true };
        }
        if (isBelowDurableLegacyCutoff(input, user.tokensInvalidBefore, user.tokensInvalidBeforeExceptJti)) {
          return { revoked: true };
        }
      } catch (error) {
        this.logger.error(`session authority unavailable, failing closed: ${String(error)}`);
        return { revoked: true };
      }
    }
    try {
      const revoked = await this.backend.isRevoked(input);
      return revoked
        ? { revoked: true }
        : { revoked: false, ...(durableAuthority === undefined ? {} : { durableAuthority }) };
    } catch (error) {
      this.logger.error(`session revocation cache unavailable, failing closed: ${String(error)}`);
      return { revoked: true };
    }
  }

  async revokeToken(jti: string | null, expiresAt: number): Promise<void> {
    if (jti === null) return;
    const ttl = expiresAt - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return;
    await this.safe(() => this.backend.revokeToken(jti, ttl));
    await this.publishInvalidation({ version: 1, kind: 'token', jti });
  }

  async revokeSession(sessionId: string, ttlSeconds: number): Promise<void> {
    await this.safe(() => this.backend.revokeSession(sessionId, ttlSeconds));
    await this.publishInvalidation({ version: 1, kind: 'session', sessionId });
  }

  async revokeAllForUser(
    subjectId: string,
    sessionTtlSeconds: number,
    exceptions?: SessionRevocationExceptions,
  ): Promise<void> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    await this.safe(() =>
      this.backend.revokeAllForUser(subjectId, nowSeconds, sessionTtlSeconds, exceptions),
    );
    // W2.15: the Redis write above is the accelerator and may fail silently by
    // design; this one is the authority for tokens without a registry `sid`.
    await this.persistLegacyTokenCutoff(subjectId, nowSeconds, exceptions?.jti ?? null);
    await this.publishInvalidation({
      version: 1,
      kind: 'user',
      subjectId,
      exceptSessionId: exceptions?.sessionId ?? null,
      exceptJti: exceptions?.jti ?? null,
    });
  }

  /**
   * W2.15 (`BA-authentication-02`): records the legacy cutoff in PostgreSQL. A
   * failure here is loud (error log) but does not throw: the caller already
   * published the socket invalidation and revoked the durable session rows, so a
   * refresh of this write is a maintenance action, not a reason to fail a logout
   * or a password change the user already completed.
   */
  private async persistLegacyTokenCutoff(
    subjectId: string,
    cutoffSeconds: number,
    exceptJti: string | null,
  ): Promise<void> {
    if (this.prisma === undefined) {
      return;
    }
    try {
      await this.prisma.user.update({
        where: { id: subjectId },
        data: {
          tokensInvalidBefore: new Date(cutoffSeconds * 1000),
          tokensInvalidBeforeExceptJti: exceptJti,
        },
      });
    } catch (error) {
      this.logger.error(
        `durable legacy token cutoff write failed, Redis remains the only cutoff: ${String(error)}`,
      );
    }
  }

  private async publishInvalidation(event: SocketSessionInvalidation): Promise<void> {
    const published = await publishSocketSessionInvalidation(this.redis, event);
    if (!published && this.redis !== undefined && this.redis !== null) {
      this.logger.warn(`session_socket_invalidation_publish_unavailable kind=${event.kind}`);
    }
  }

  private async safe(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.warn(`session revocation write failed: ${String(error)}`);
    }
  }
}
