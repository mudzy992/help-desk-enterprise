import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrincipalContextLoader } from './principal-context.loader';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('durable multi-replica principal authority (integration)', () => {
  let prisma: PrismaClient;
  const stamp = Date.now();
  let userId: string;
  let roleId: string;
  const entries = new Map<string, string>();
  const redis = {
    status: 'ready',
    connect: async () => undefined,
    get: async (key: string) => entries.get(key) ?? null,
    set: async (key: string, value: string, _mode: 'EX', _ttl: number, nx?: 'NX') => {
      if (nx === 'NX' && entries.has(key)) return null;
      entries.set(key, value);
      return 'OK';
    },
    del: async (key: string) => entries.delete(key),
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const [user, role] = await Promise.all([
      prisma.user.create({ data: { email: `authority-${stamp}@example.invalid`, displayName: 'Authority fixture' } }),
      prisma.role.create({ data: { key: `IT_AUTHORITY_${stamp}`, name: 'Authority fixture' } }),
    ]);
    userId = user.id;
    roleId = role.id;
    await prisma.userRole.create({ data: { userId, roleId } });
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  it('replica B rejects replica A committed deactivation despite a stale shared cache', async () => {
    const replicaA = new PrincipalContextLoader(prisma as never, redis as never);
    const replicaB = new PrincipalContextLoader(prisma as never, redis as never);
    expect((await replicaA.load(userId))?.isActive).toBe(true);

    // No Redis invalidation is performed: this models a failed tombstone write.
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });

    expect((await replicaB.load(userId))?.isActive).toBe(false);
  });
});
