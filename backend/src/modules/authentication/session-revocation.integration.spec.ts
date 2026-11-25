import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { SessionRegistryService } from './security/session-registry.service';
import { SessionRevocationStore } from './session-revocation.store';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('durable multi-replica session revocation (integration)', () => {
  let prisma: PrismaClient;
  const stamp = Date.now();
  let userId: string;

  const staleRedis = {
    mget: async () => [null, null, null],
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const user = await prisma.user.create({
      data: { email: `revocation-${stamp}@example.invalid`, displayName: 'Revocation fixture' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('makes a revocation committed by replica A visible to replica B despite a stale Redis replica', async () => {
    const session = await prisma.userSession.create({
      data: {
        userId,
        provider: 'local',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const replicaB = new SessionRevocationStore(staleRedis as never, prisma as never);
    const check = { jti: 'token-1', subjectId: userId, issuedAt: 1, sessionId: session.id };

    await expect(replicaB.isRevoked(check)).resolves.toBe(false);

    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: 'admin' },
    });

    await expect(replicaB.isRevoked(check)).resolves.toBe(true);
  });

  it('does not accept a session id owned by another principal', async () => {
    const session = await prisma.userSession.create({
      data: { userId, provider: 'local', expiresAt: new Date(Date.now() + 60_000) },
    });
    const healthyRedis = { mget: async () => [null, null, null] };
    const replica = new SessionRevocationStore(healthyRedis as never, prisma as never);
    await expect(replica.isRevoked({
      jti: 'token-2', subjectId: 'different-user', issuedAt: 1, sessionId: session.id,
    })).resolves.toBe(true);
  });

  /*
    BA-authentication-01 (W2.14): `AuthenticationService.refresh()` now refuses a
    `sid` token unless this lookup returns a live row owned by the token subject.
    The unit tests mock the registry, so this case pins the real SQL contract:
    revoked, expired and deleted rows all read as "no live session".
  */
  it('treats a revoked, expired or deleted registry row as no live session', async () => {
    const registry = new SessionRegistryService(prisma as never, {} as never, {} as never);
    const live = await prisma.userSession.create({
      data: { userId, provider: 'local', expiresAt: new Date(Date.now() + 60_000) },
    });
    await expect(registry.findActive(live.id)).resolves.toMatchObject({
      id: live.id,
      userId,
    });

    await prisma.userSession.update({
      where: { id: live.id },
      data: { revokedAt: new Date(), revokedReason: 'admin' },
    });
    await expect(registry.findActive(live.id)).resolves.toBeNull();

    const expired = await prisma.userSession.create({
      data: { userId, provider: 'local', expiresAt: new Date(Date.now() - 60_000) },
    });
    await expect(registry.findActive(expired.id)).resolves.toBeNull();

    const deleted = await prisma.userSession.create({
      data: { userId, provider: 'local', expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.userSession.delete({ where: { id: deleted.id } });
    await expect(registry.findActive(deleted.id)).resolves.toBeNull();
  });

  /*
    W2.15 (`BA-authentication-02`): the durable cutoff must survive the case the
    finding describes — no Redis at all. This store is built with the memory
    backend, so the only way `isRevoked` can answer `true` is the PostgreSQL row.
  */
  it('keeps a legacy token revoked when no Redis write ever happened', async () => {
    const store = new SessionRevocationStore(undefined, prisma as never);
    const before = Math.floor(Date.now() / 1000) - 60;
    const after = Math.floor(Date.now() / 1000) + 60;

    await store.revokeAllForUser(userId, 3_600);

    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { tokensInvalidBefore: true },
    });
    expect(row?.tokensInvalidBefore).toBeInstanceOf(Date);

    await expect(
      store.isRevoked({ jti: 'legacy-old', subjectId: userId, issuedAt: before, sessionId: null }),
    ).resolves.toBe(true);
    await expect(
      store.isRevoked({ jti: 'legacy-new', subjectId: userId, issuedAt: after, sessionId: null }),
    ).resolves.toBe(false);
  });

  it('preserves the caller token of a revoke-others call in the durable cutoff', async () => {
    const store = new SessionRevocationStore(undefined, prisma as never);
    const before = Math.floor(Date.now() / 1000) - 60;

    await store.revokeAllForUser(userId, 3_600, { jti: 'caller-jti' });

    await expect(
      store.isRevoked({ jti: 'caller-jti', subjectId: userId, issuedAt: before, sessionId: null }),
    ).resolves.toBe(false);
    await expect(
      store.isRevoked({ jti: 'sibling-jti', subjectId: userId, issuedAt: before, sessionId: null }),
    ).resolves.toBe(true);
  });

  it('does not apply the legacy cutoff to a sid token that still has a live row', async () => {
    const store = new SessionRevocationStore(undefined, prisma as never);
    const session = await prisma.userSession.create({
      data: { userId, provider: 'local', expiresAt: new Date(Date.now() + 60_000) },
    });

    await store.revokeAllForUser(userId, 3_600, { sessionId: session.id });

    await expect(
      store.isRevoked({ jti: 'sid-token', subjectId: userId, issuedAt: 1, sessionId: session.id }),
    ).resolves.toBe(false);
  });
});
