import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { DatabaseLockService } from './database-lock.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('transaction-scoped PostgreSQL lock primitive', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const locks = new DatabaseLockService();
  const topic = `it.locks.${Date.now()}`;
  const identity = { namespace: 'sequence.integration', key: topic };

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });
  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { topic } });
    await prisma.$disconnect();
  });

  it('returns stable unavailable/timeout outcomes and releases the lock at transaction end', async () => {
    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { acquired = resolve; });
    const owner = prisma.$transaction((transaction) => locks.withAdvisoryLock(transaction, identity, async () => {
      acquired();
      await held;
    }), { timeout: 15_000 });
    await ready;

    await expect(prisma.$transaction((transaction) =>
      locks.tryWithAdvisoryLock(transaction, identity, async () => true),
    )).rejects.toMatchObject({ code: 'DATABASE_LOCK_UNAVAILABLE' });
    await expect(prisma.$transaction((transaction) =>
      locks.withAdvisoryLock(transaction, identity, async () => true, 100),
    )).rejects.toMatchObject({ code: 'DATABASE_LOCK_TIMEOUT' });

    release();
    await owner;
    await expect(prisma.$transaction((transaction) =>
      locks.withAdvisoryLock(transaction, identity, async () => 'acquired-after-commit'),
    )).resolves.toBe('acquired-after-commit');
  });

  it('serializes a read-modify-write sequence across two transactions', async () => {
    const payload = { sequence: true };
    const row = await prisma.outboxMessage.create({
      data: {
        topic, dedupeKey: 'serialized-sequence-01', payload,
        payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const increment = () => prisma.$transaction((transaction) =>
      locks.withAdvisoryLock(transaction, { namespace: 'sequence.integration', key: row.id }, async () => {
        const current = await transaction.outboxMessage.findUniqueOrThrow({ where: { id: row.id }, select: { attempts: true } });
        await new Promise((resolve) => setTimeout(resolve, 75));
        await transaction.outboxMessage.update({ where: { id: row.id }, data: { attempts: current.attempts + 1 } });
      }), { timeout: 15_000 });
    await Promise.all([increment(), increment()]);
    expect(await prisma.outboxMessage.findUniqueOrThrow({ where: { id: row.id }, select: { attempts: true } })).toEqual({ attempts: 2 });
  });

  it('executes a row-lock callback before its protected operation', async () => {
    const events: string[] = [];
    await prisma.$transaction(async (transaction) => locks.withRowLock({
      lock: async () => {
        events.push('lock');
        const rows = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "OutboxMessage" WHERE "topic" = ${topic} LIMIT 1 FOR UPDATE`;
        return rows[0] ?? null;
      },
      operation: async (row) => { events.push(`operation:${row.id}`); },
    }), { timeout: 15_000 });
    expect(events[0]).toBe('lock');
    expect(events[1]).toMatch(/^operation:/u);
  });
});
