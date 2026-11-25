import { JwtService } from '@nestjs/jwt';
import { SessionTokenService } from './session-token.service';
import { socketSessionInvalidationChannel } from '../../common/security/socket-session-invalidation';
import { readOrganizationalUnitCatalogRevision } from '../../common/cache/scope-catalog-cache';
import { runWithRequestId } from '../../common/request-context/request-context.storage';
import {
  createMemorySessionRevocationBackend,
  createRedisSessionRevocationBackend,
  SessionRevocationStore,
} from './session-revocation.store';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('session revocation (review 2026-09-25, S1/S2)', () => {
  const secret = 'x'.repeat(40);
  const make = () =>
    new SessionTokenService(new JwtService({}), { load: async () => secret } as never, new SessionRevocationStore());
  const principal = { subjectId: 'u1', email: 'a@b.ba', displayName: 'A', isLocalOnly: true } as never;

  it('issues 1 h tokens with a jti', async () => {
    const service = make();
    const claims = await service.verify(await service.issue(principal));
    expect(claims.jti).toEqual(expect.any(String));
    expect(claims.expiresAt - claims.issuedAt).toBe(3600);
  });

  it('logout revokes exactly that token', async () => {
    const service = make();
    const a = await service.issue(principal);
    const b = await service.issue(principal);
    await service.revoke(await service.verify(a));
    await expect(service.verify(a)).rejects.toThrow();
    await expect(service.verify(b)).resolves.toMatchObject({ subjectId: 'u1' });
  });

  it('publishes token, session and user invalidations for connected sockets', async () => {
    const redis = {
      status: 'ready',
      mget: jest.fn(async () => [null, null, null]),
      set: jest.fn(async () => 'OK'),
      publish: jest.fn(async (_channel: string, _payload: string) => 1),
    };
    const store = new SessionRevocationStore(redis as never);
    const expiry = Math.floor(Date.now() / 1000) + 3_600;

    await store.revokeToken('logout-jti', expiry);
    await store.revokeSession('revoked-session', 3_600);
    await store.revokeAllForUser('u1', 3_600, {
      sessionId: 'keep-session',
      jti: 'keep-legacy-jti',
    });

    expect(redis.publish.mock.calls.map(([channel, payload]) => [
      channel,
      JSON.parse(payload),
    ])).toEqual([
      [socketSessionInvalidationChannel, { version: 1, kind: 'token', jti: 'logout-jti' }],
      [socketSessionInvalidationChannel, { version: 1, kind: 'session', sessionId: 'revoked-session' }],
      [
        socketSessionInvalidationChannel,
        {
          version: 1,
          kind: 'user',
          subjectId: 'u1',
          exceptSessionId: 'keep-session',
          exceptJti: 'keep-legacy-jti',
        },
      ],
    ]);
  });

  it('password change revokes every earlier session of the user', async () => {
    const service = make();
    const old = await service.issue(principal);
    const realNow = Date.now;
    Date.now = () => realNow() + 2000;
    try {
      await service.revokeAllForUser('u1');
      await expect(service.verify(old)).rejects.toThrow();
    } finally {
      Date.now = realNow;
    }
  });

  it('revokes the old sid while allowing a new sid issued in the same second', async () => {
    const realNow = Date.now;
    Date.now = () => 1_800_000_000_000;
    try {
      const revocation = new SessionRevocationStore();
      const service = new SessionTokenService(
        new JwtService({}),
        { load: async () => secret } as never,
        revocation,
      );
      const oldToken = await service.issue(principal, 'sid-before');
      await service.revokeSession('sid-before');
      await service.revokeAllForUser('u1');
      const newToken = await service.issue(principal, 'sid-after');

      await expect(service.verify(oldToken)).rejects.toThrow();
      await expect(service.verify(newToken)).resolves.toMatchObject({
        subjectId: 'u1',
        sessionId: 'sid-after',
      });
    } finally {
      Date.now = realNow;
    }
  });

  it('preserves the current legacy token by jti while cutting off other no-sid tokens', async () => {
    const realNow = Date.now;
    Date.now = () => 1_800_000_000_000;
    try {
      const service = make();
      const current = await service.issue(principal);
      const other = await service.issue(principal);
      const currentClaims = await service.verify(current);
      await service.revokeAllForUser('u1', { jti: currentClaims.jti });
      await expect(service.verify(current)).resolves.toMatchObject({ jti: currentClaims.jti });
      await expect(service.verify(other)).rejects.toThrow();
    } finally {
      Date.now = realNow;
    }
  });

  it('uses an inclusive same-second cutoff only for legacy tokens without sid', async () => {
    const realNow = Date.now;
    Date.now = () => 1_800_000_000_000;
    try {
      const revocation = new SessionRevocationStore();
      const service = new SessionTokenService(
        new JwtService({}),
        { load: async () => secret } as never,
        revocation,
      );
      const legacyToken = await service.issue(principal);
      await service.revokeAllForUser('u1');
      await expect(service.verify(legacyToken)).rejects.toThrow();
    } finally {
      Date.now = realNow;
    }
  });
});

describe('durable session authority', () => {
  const check = { jti: 'j1', subjectId: 'u1', issuedAt: 1, sessionId: 'sid-1' };

  it('rejects a PostgreSQL-revoked session even when Redis says it is active', async () => {
    const redis = { mget: jest.fn(async () => [null, null, null]) };
    const prisma = { $queryRaw: jest.fn(async () => []) };
    const store = new SessionRevocationStore(redis as never, prisma as never);
    await expect(store.isRevoked(check)).resolves.toBe(true);
  });

  it('returns the user authority snapshot from the joined durable session read', async () => {
    const redis = { mget: jest.fn(async () => [null, null, null]) };
    const queryRaw = jest.fn(async () => [
      {
        subjectId: 'u1',
        authzVersion: 7,
        isActive: true,
        mustChangePassword: false,
        catalogueRevision: 12n,
      },
    ]);
    const store = new SessionRevocationStore(redis as never, { $queryRaw: queryRaw } as never);

    await expect(store.check(check)).resolves.toEqual({
      revoked: false,
      durableAuthority: {
        subjectId: 'u1',
        authzVersion: 7,
        isActive: true,
        mustChangePassword: false,
      },
    });
    // Perf kapija (2026-10-29): one statement carries session, user authority and
    // the catalogue-OJ revision, so authorization needs no second `SELECT`.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = String((queryRaw.mock.calls[0] as unknown[])[0]);
    expect(sql).toContain('"UserSession"');
    expect(sql).toContain('"OrganizationalUnitCatalogRevision"');
  });

  it('creates a socket lease from durable legacy-token authority and detects authz drift', async () => {
    const authority = {
      id: 'u1',
      authzVersion: 4,
      isActive: true,
      mustChangePassword: false,
    };
    const redis = { mget: jest.fn(async () => [null, null, null]) };
    const prisma = {
      user: { findUnique: jest.fn(async () => authority) },
    };
    const store = new SessionRevocationStore(redis as never, prisma as never);
    const service = new SessionTokenService(
      new JwtService({}),
      { load: async () => 'x'.repeat(40) } as never,
      store,
    );
    const token = await service.issue({
      subjectId: 'u1',
      email: 'a@b.ba',
      displayName: 'A',
      isLocalOnly: true,
    } as never);
    const lease = await service.verifyForSocket(token);

    expect(lease).toMatchObject({ subjectId: 'u1', sessionId: null, authzVersion: 4 });
    await expect(service.isSocketSessionCurrent(lease)).resolves.toBe(true);
    authority.authzVersion = 5;
    await expect(service.isSocketSessionCurrent(lease)).resolves.toBe(false);
  });

  it('rejects a durable active session when its user is inactive or must change password', async () => {
    const redis = { mget: jest.fn(async () => [null, null, null]) };
    const store = new SessionRevocationStore(
      redis as never,
      {
        $queryRaw: jest.fn(async () => [
          {
            subjectId: 'u1',
            authzVersion: 7,
            isActive: false,
            mustChangePassword: false,
            catalogueRevision: 3n,
          },
        ]),
      } as never,
    );

    await expect(store.check(check)).resolves.toEqual({ revoked: true });
    expect(redis.mget).not.toHaveBeenCalled();
  });

  it('fails closed when PostgreSQL session authority is unavailable', async () => {
    const redis = { mget: jest.fn(async () => [null, null, null]) };
    const prisma = {
      $queryRaw: jest.fn(async () => {
        throw new Error('postgres down');
      }),
    };
    const store = new SessionRevocationStore(redis as never, prisma as never);
    await expect(store.isRevoked(check)).resolves.toBe(true);
  });

  it('hands the catalogue revision to the request scope without another statement', async () => {
    const redis = { mget: jest.fn(async () => [null, null, null]) };
    const store = new SessionRevocationStore(
      redis as never,
      {
        $queryRaw: jest.fn(async () => [
          {
            subjectId: 'u1',
            authzVersion: 7,
            isActive: true,
            mustChangePassword: false,
            catalogueRevision: 42n,
          },
        ]),
      } as never,
    );

    await runWithRequestId('perf-fusion-request', async () => {
      await expect(store.check(check)).resolves.toMatchObject({ revoked: false });
      // The revision delegate is deliberately absent: a cache check that fell
      // back to its own read would throw here, so this proves zero extra statements.
      await expect(readOrganizationalUnitCatalogRevision({} as never)).resolves.toBe(42n);
    });
  });

  it('rejects an active durable session when the Redis revocation check is unavailable', async () => {
    const redis = { mget: jest.fn(async () => { throw new Error('redis down'); }) };
    const prisma = {
      $queryRaw: jest.fn(async () => [
        {
          subjectId: 'u1',
          authzVersion: 0,
          isActive: true,
          mustChangePassword: false,
          catalogueRevision: null,
        },
      ]),
    };
    const store = new SessionRevocationStore(redis as never, prisma as never);
    await expect(store.isRevoked(check)).resolves.toBe(true);
  });
});

describe('session revocation adapters at the same-second boundary', () => {
  it('memory backend checks sid first and does not reject a fresh sid at the cutoff second', async () => {
    const backend = createMemorySessionRevocationBackend(() => 1_800_000_000_000);
    await backend.revokeAllForUser('u1', 1_800_000_000, 3_600);
    await backend.revokeSession('old-sid', 3_600);
    await expect(backend.isRevoked({
      jti: 'old-token', subjectId: 'u1', issuedAt: 1_800_000_000, sessionId: 'old-sid',
    })).resolves.toBe(true);
    await expect(backend.isRevoked({
      jti: 'new-token', subjectId: 'u1', issuedAt: 1_800_000_000, sessionId: 'new-sid',
    })).resolves.toBe(false);
    await expect(backend.isRevoked({
      jti: 'legacy-token', subjectId: 'u1', issuedAt: 1_800_000_000, sessionId: null,
    })).resolves.toBe(true);
  });

  it('memory cutoff exceptions keep only the current sid or legacy jti', async () => {
    const at = 1_800_000_000;
    const backend = createMemorySessionRevocationBackend(() => at * 1000);
    await backend.revokeAllForUser('u1', at, 3_600, { sessionId: 'keep-sid', jti: 'keep-jti' });
    await expect(backend.isRevoked({
      jti: 'keep-sid-token', subjectId: 'u1', issuedAt: at - 1, sessionId: 'keep-sid',
    })).resolves.toBe(false);
    await expect(backend.isRevoked({
      jti: 'old-sid-token', subjectId: 'u1', issuedAt: at - 1, sessionId: 'old-sid',
    })).resolves.toBe(true);
    await expect(backend.isRevoked({
      jti: 'keep-jti', subjectId: 'u1', issuedAt: at, sessionId: null,
    })).resolves.toBe(false);
    await expect(backend.isRevoked({
      jti: 'other-legacy-jti', subjectId: 'u1', issuedAt: at, sessionId: null,
    })).resolves.toBe(true);
  });

  it('Redis cutoffs preserve only the current sid or legacy jti and read old numeric values', async () => {
    const at = 1_800_000_000;
    const values = new Map<string, string>([
      [
        'auth:sessions-valid-after:u1',
        JSON.stringify({ at, exceptSessionId: 'keep-sid', exceptJti: 'keep-jti' }),
      ],
    ]);
    const redis = {
      mget: jest.fn(async (...keys: string[]) => keys.map((key) => values.get(key) ?? null)),
      set: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
    };
    const backend = createRedisSessionRevocationBackend(redis as never);
    await expect(backend.isRevoked({
      jti: 'sid-token', subjectId: 'u1', issuedAt: at - 1, sessionId: 'keep-sid',
    })).resolves.toBe(false);
    await expect(backend.isRevoked({
      jti: 'old-token', subjectId: 'u1', issuedAt: at - 1, sessionId: 'old-sid',
    })).resolves.toBe(true);
    await expect(backend.isRevoked({
      jti: 'keep-jti', subjectId: 'u1', issuedAt: at, sessionId: null,
    })).resolves.toBe(false);
    await expect(backend.isRevoked({
      jti: 'old-legacy-token', subjectId: 'u1', issuedAt: at, sessionId: null,
    })).resolves.toBe(true);

    values.set('auth:sessions-valid-after:u1', String(at));
    await expect(backend.isRevoked({
      jti: 'legacy-token', subjectId: 'u1', issuedAt: at, sessionId: null,
    })).resolves.toBe(true);
  });

  it('applies the same boundary rules to Redis keys', async () => {
    const values = new Map<string, string>();
    const redis = {
      mget: jest.fn(async (...keys: string[]) => keys.map((key) => values.get(key) ?? null)),
      set: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
    };
    const backend = createRedisSessionRevocationBackend(redis as never);
    await backend.revokeAllForUser('u1', 1_800_000_000, 3_600);
    await backend.revokeSession('old-sid', 3_600);
    await expect(backend.isRevoked({
      jti: 'old-token', subjectId: 'u1', issuedAt: 1_800_000_000, sessionId: 'old-sid',
    })).resolves.toBe(true);
    await expect(backend.isRevoked({
      jti: 'new-token', subjectId: 'u1', issuedAt: 1_800_000_000, sessionId: 'new-sid',
    })).resolves.toBe(false);
    await expect(backend.isRevoked({
      jti: 'legacy-token', subjectId: 'u1', issuedAt: 1_800_000_000, sessionId: null,
    })).resolves.toBe(true);
  });
});

/*
  W2.15 (`BA-authentication-02`): a token without a registry `sid` has no
  `UserSession` row to revoke, so before this package its revocation lived only in
  two best-effort Redis writes. The durable cutoff on `User` is the authority; the
  Redis key stays the accelerator. These tests inject the failure the finding
  describes - a rejected Redis write - and require the token to die anyway.
*/
describe('durable legacy token cutoff (W2.15, BA-authentication-02)', () => {
  const cutoff = new Date(1_700_000_000_000);
  const legacyClaims = (issuedAt: number, jti = 'legacy-jti') => ({
    jti,
    subjectId: 'u1',
    issuedAt,
    sessionId: null,
  });

  function userRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'u1',
      authzVersion: 0,
      isActive: true,
      mustChangePassword: false,
      tokensInvalidBefore: cutoff,
      tokensInvalidBeforeExceptJti: null,
      ...overrides,
    };
  }

  function storeWith(prisma: unknown) {
    return new SessionRevocationStore(undefined, prisma as never);
  }

  it('rejects a legacy token issued at or before the durable cutoff', async () => {
    const store = storeWith({ user: { findUnique: jest.fn(async () => userRow()) } });

    await expect(store.isRevoked(legacyClaims(1_700_000_000))).resolves.toBe(true);
    await expect(store.isRevoked(legacyClaims(1_699_999_999))).resolves.toBe(true);
  });

  it('accepts a legacy token issued after the cutoff', async () => {
    const store = storeWith({ user: { findUnique: jest.fn(async () => userRow()) } });

    await expect(store.isRevoked(legacyClaims(1_700_000_001))).resolves.toBe(false);
  });

  it('keeps the one caller token a revoke-others call exempted', async () => {
    const store = storeWith({
      user: { findUnique: jest.fn(async () => userRow({ tokensInvalidBeforeExceptJti: 'caller-jti' })) },
    });

    await expect(store.isRevoked(legacyClaims(1_700_000_000, 'caller-jti'))).resolves.toBe(false);
    await expect(store.isRevoked(legacyClaims(1_700_000_000, 'other-jti'))).resolves.toBe(true);
  });

  it('writes the cutoff to PostgreSQL even when the Redis write is rejected', async () => {
    const update = jest.fn(async () => ({}));
    const redis = {
      status: 'ready',
      mget: jest.fn(async () => [null, null, null]),
      set: jest.fn(async () => {
        throw new Error('redis write failed');
      }),
      publish: jest.fn(async () => 1),
    };
    const store = new SessionRevocationStore(redis as never, {
      user: { findUnique: jest.fn(), update },
    } as never);

    await expect(store.revokeAllForUser('u1', 3_600)).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { tokensInvalidBefore: expect.any(Date), tokensInvalidBeforeExceptJti: null },
    });
  });

  it('stores the exempted jti with the cutoff so revoke-others keeps the caller', async () => {
    const update = jest.fn(async () => ({}));
    const store = new SessionRevocationStore(undefined, { user: { update } } as never);

    await store.revokeAllForUser('u1', 3_600, { jti: 'caller-jti' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { tokensInvalidBefore: expect.any(Date), tokensInvalidBeforeExceptJti: 'caller-jti' },
    });
  });

  it('still revokes on a failed Redis read even when the cutoff write failed too', async () => {
    const update = jest.fn(async () => {
      throw new Error('database write failed');
    });
    const redis = {
      status: 'ready',
      mget: jest.fn(async () => [null, null, null]),
      set: jest.fn(async () => 'OK'),
      publish: jest.fn(async () => 1),
    };
    const store = new SessionRevocationStore(redis as never, {
      user: { findUnique: jest.fn(), update },
    } as never);

    // A failed durable write must not turn a completed logout into a 500; the
    // error log is the alarm and the next check fails closed on its own read.
    await expect(store.revokeAllForUser('u1', 3_600)).resolves.toBeUndefined();
    expect(update).toHaveBeenCalled();
  });
});
