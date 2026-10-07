import { JwtService } from '@nestjs/jwt';
import { SessionTokenService } from './session-token.service';
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
