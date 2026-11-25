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
});
