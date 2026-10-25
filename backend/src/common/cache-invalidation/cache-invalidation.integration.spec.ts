import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { TransactionalOutboxService } from '../outbox/transactional-outbox.service';
import { CacheInvalidationService } from './cache-invalidation.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('durable post-commit cache invalidation', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let producer: CacheInvalidationService;
  let replicaConsumer: CacheInvalidationService;
  const namespace = `it.cache.${Date.now()}`;
  const topic = `cache.invalidate.${namespace}`;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    producer = new CacheInvalidationService(new TransactionalOutboxService(prisma as never));
    replicaConsumer = new CacheInvalidationService(new TransactionalOutboxService(prisma as never));
  });
  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { topic } });
    await prisma.$disconnect();
  });

  it('rolls invalidation intent back with the business transaction', async () => {
    await expect(prisma.$transaction(async (transaction) => {
      await producer.schedule(transaction, { namespace, key: 'rollback-cache-key', revision: 2 });
      throw new Error('business rollback');
    })).rejects.toThrow('business rollback');
    expect(await prisma.outboxMessage.count({ where: { topic } })).toBe(0);
  });

  it('delivers a committed invalidation to another replica exactly through the durable outbox', async () => {
    await prisma.$transaction((transaction) => producer.schedule(transaction, {
      namespace, key: 'shared-cache-key', revision: 9,
    }));
    const invalidate = jest.fn(async () => undefined);
    await expect(replicaConsumer.dispatchOne(namespace, invalidate)).resolves.toBe('succeeded');
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ key: 'shared-cache-key', revision: 9 }));
    expect(await prisma.outboxMessage.count({ where: { topic, status: 'SUCCEEDED' } })).toBe(1);
  });

  it('retains a failed invalidation for retry instead of failing the committed mutation', async () => {
    await prisma.$transaction((transaction) => producer.schedule(transaction, {
      namespace, key: 'retry-cache-key', revision: 10,
    }));
    await expect(replicaConsumer.dispatchOne(namespace, async () => { throw new Error('redis unavailable'); })).resolves.toBe('retry');
    expect(await prisma.outboxMessage.count({ where: { topic, status: 'PENDING', attempts: 1 } })).toBe(1);
  });
});
