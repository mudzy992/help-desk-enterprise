import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../generated/prisma/client';
import { BulkCommandItemError } from './bulk-command.error';
import { BulkCommandService } from './bulk-command.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('bulk command PostgreSQL transaction modes', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let bulk: BulkCommandService;
  const topic = `it.bulk.${Date.now()}`;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    bulk = new BulkCommandService(prisma as never);
  });
  afterAll(async () => {
    await prisma.outboxMessage.deleteMany({ where: { topic } });
    await prisma.$disconnect();
  });

  const persist = async (item: { key: string; payload: number }, transaction: Prisma.TransactionClient) => {
    if (item.payload === 2) throw new BulkCommandItemError('TEST_ITEM_REJECTED', 'Test rejection');
    const payload = { value: item.payload };
    await transaction.outboxMessage.create({
      data: {
        topic, dedupeKey: item.key, payload,
        payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    return item.payload;
  };

  it('rolls back every write in atomic mode after one item fails', async () => {
    const result = await bulk.execute({
      mode: 'atomic',
      items: [1, 2, 3].map((payload) => ({ key: `atomic-item-${payload}`, payload })),
      handle: persist,
    });
    expect(result).toMatchObject({ outcome: 'FAILED', committed: false, succeeded: 0, failed: 1 });
    expect(await prisma.outboxMessage.count({ where: { topic, dedupeKey: { startsWith: 'atomic-' } } })).toBe(0);
  });

  it('commits successes independently and reports partial best-effort results', async () => {
    const result = await bulk.execute({
      mode: 'best-effort',
      items: [1, 2, 3].map((payload) => ({ key: `best-effort-item-${payload}`, payload })),
      handle: persist,
    });
    expect(result).toMatchObject({ outcome: 'PARTIAL', committed: true, succeeded: 2, failed: 1 });
    expect(result.results.map(({ status }) => status)).toEqual(['SUCCEEDED', 'FAILED', 'SUCCEEDED']);
    expect(await prisma.outboxMessage.count({ where: { topic, dedupeKey: { startsWith: 'best-effort-' } } })).toBe(2);
  });
});
