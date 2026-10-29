import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { OptimisticConcurrencyService } from './optimistic-concurrency.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('optimistic concurrency PostgreSQL CAS', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const service = new OptimisticConcurrencyService();
  const topic = `it.optimistic.${Date.now()}`;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });
  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { topic } });
    await prisma.$disconnect();
  });

  it('permits exactly one winner for two concurrent writes with the same version', async () => {
    const payload = { test: true };
    const row = await prisma.outboxMessage.create({
      data: {
        topic, dedupeKey: 'optimistic-cas-row-0001', payload,
        payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const command = () => service.execute({
      ifMatch: '"v1"',
      mutate: async (expectedVersion) => {
        const changed = await prisma.outboxMessage.updateMany({
          where: { id: row.id, attempts: expectedVersion - 1 },
          data: { attempts: { increment: 1 } },
        });
        if (changed.count !== 1) return null;
        const updated = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: row.id }, select: { attempts: true } });
        return { value: updated.attempts, version: updated.attempts + 1 };
      },
      readCurrentVersion: async () => {
        const current = await prisma.outboxMessage.findUnique({ where: { id: row.id }, select: { attempts: true } });
        return current === null ? null : current.attempts + 1;
      },
    });

    const outcomes = await Promise.allSettled([command(), command()]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ code: 'OPTIMISTIC_STALE_WRITE', httpStatus: 412, currentEtag: '"v2"' }) }),
    ]);
    expect(await prisma.outboxMessage.findUniqueOrThrow({ where: { id: row.id }, select: { attempts: true } })).toEqual({ attempts: 1 });
  });
});
