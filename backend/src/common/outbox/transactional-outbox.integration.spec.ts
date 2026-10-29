import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { JsonValue } from '../../modules/change-log/change-log.types';
import { TransactionalOutboxService } from './transactional-outbox.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('transactional outbox (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let outbox: TransactionalOutboxService;
  const topic = `it.outbox.${Date.now()}`;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    outbox = new TransactionalOutboxService(prisma as never);
  });
  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { topic } });
    await prisma.$disconnect();
  });

  const enqueue = (key: string, payload: JsonValue = { event: 'created' }, maxAttempts?: number) =>
    prisma.$transaction((transaction) => outbox.enqueue(transaction, { topic, dedupeKey: key, payload, maxAttempts }));

  it('commits intent with the business transaction and rolls both back together', async () => {
    await expect(prisma.$transaction(async (transaction) => {
      await outbox.enqueue(transaction, { topic, dedupeKey: 'rollback-intent-0001', payload: { ok: false } });
      throw new Error('business rollback');
    })).rejects.toThrow('business rollback');
    expect(await prisma.outboxMessage.count({ where: { topic, dedupeKey: 'rollback-intent-0001' } })).toBe(0);
  });

  it('deduplicates identical enqueue and rejects a mismatched payload', async () => {
    const first = await enqueue('dedupe-message-00001', { b: 2, a: 1 });
    const duplicate = await enqueue('dedupe-message-00001', { a: 1, b: 2 });
    expect(duplicate).toEqual({ id: first.id, created: false });
    await expect(enqueue('dedupe-message-00001', { a: 9 })).rejects.toMatchObject({ code: 'OUTBOX_PAYLOAD_MISMATCH' });
    await prisma.outboxMessage.update({ where: { id: first.id }, data: { status: 'SUCCEEDED', completedAt: new Date() } });
  });

  it('allows only one of two workers to dispatch a message', async () => {
    await enqueue('parallel-workers-0001');
    let deliveries = 0;
    const handler = async () => { deliveries += 1; await new Promise((resolve) => setTimeout(resolve, 100)); };
    const results = await Promise.all([outbox.dispatchOne(topic, handler), outbox.dispatchOne(topic, handler)]);
    expect(deliveries).toBe(1);
    expect(results.sort()).toEqual(['idle', 'succeeded']);
  });

  it('reclaims an expired worker lease after a crash', async () => {
    await enqueue('expired-worker-lease-01');
    const claimed = await outbox.dispatchOne(topic, async () => { throw new Error('temporary'); });
    expect(claimed).toBe('retry');
    await prisma.outboxMessage.update({
      where: { topic_dedupeKey: { topic, dedupeKey: 'expired-worker-lease-01' } },
      data: { status: 'PROCESSING', ownerToken: randomUUID(), leaseExpiresAt: new Date(0), nextAttemptAt: new Date(0) },
    });
    await expect(outbox.dispatchOne(topic, async () => undefined)).resolves.toBe('succeeded');
  });

  it('moves poison work to dead-letter and replays it with operator provenance', async () => {
    await enqueue('dead-letter-replay-001', { poison: true }, 1);
    await expect(outbox.dispatchOne(topic, async () => { throw new Error('provider rejected'); })).resolves.toBe('dead-letter');
    const dead = await prisma.outboxMessage.findUniqueOrThrow({ where: { topic_dedupeKey: { topic, dedupeKey: 'dead-letter-replay-001' } } });
    expect(dead).toMatchObject({ status: 'DEAD_LETTER', attempts: 1 });
    await outbox.replayDeadLetter(dead.id, { actor: 'operator@example.test', reason: 'Provider configuration repaired' });
    await expect(outbox.dispatchOne(topic, async () => undefined)).resolves.toBe('succeeded');
    const replayed = await prisma.outboxMessage.findUniqueOrThrow({ where: { id: dead.id } });
    expect(replayed).toMatchObject({ status: 'SUCCEEDED', replayCount: 1, lastReplayedBy: 'operator@example.test' });
  });
});
