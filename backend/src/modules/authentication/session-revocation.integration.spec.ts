import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
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
});
