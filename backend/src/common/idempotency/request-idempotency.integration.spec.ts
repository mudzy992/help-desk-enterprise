import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { RequestIdempotencyService } from './request-idempotency.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('persisted request idempotency (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let service: RequestIdempotencyService;
  const namespace = `it.idempotency.${Date.now()}`;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    service = new RequestIdempotencyService(prisma as never);
  });
  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { namespace } });
    await prisma.$disconnect();
  });

  it('executes duplicate delivery exactly once and replays the persisted result', async () => {
    let effects = 0;
    const command = () => service.execute({
      namespace, key: 'duplicate-delivery-0001', request: { ticketId: 'ticket-1', value: 7 },
      operation: async () => {
        effects += 1;
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { statusCode: 201, body: { id: 'result-1', accepted: true } };
      },
    });
    const deliveries = await Promise.allSettled([command(), command()]);
    expect(effects).toBe(1);
    const fulfilled = deliveries.filter((delivery) => delivery.status === 'fulfilled');
    const rejected = deliveries.filter((delivery) => delivery.status === 'rejected');
    expect(fulfilled.length + rejected.length).toBe(2);
    expect(rejected).toEqual(rejected.length === 0 ? [] : [expect.objectContaining({
      reason: expect.objectContaining({ code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' }),
    })]);
    expect(fulfilled).toContainEqual(expect.objectContaining({ value: expect.objectContaining({ replayed: false }) }));
    await expect(command()).resolves.toMatchObject({ replayed: true, body: { id: 'result-1', accepted: true } });
    expect(await prisma.idempotencyRecord.count({ where: { namespace, key: 'duplicate-delivery-0001', status: 'SUCCEEDED' } })).toBe(1);
  });

  it('returns the committed outcome after a caller loses the first response', async () => {
    let effects = 0;
    const input = {
      namespace, key: 'timeout-retry-00000001', request: { command: 'create' },
      operation: async () => { effects += 1; return { statusCode: 202, body: { operationId: 'op-1' } }; },
    } as const;
    const first = await service.execute(input);
    const retry = await service.execute(input);
    expect(first.replayed).toBe(false);
    expect(retry).toEqual({ ...first, replayed: true });
    expect(effects).toBe(1);
  });

  it('rejects key reuse with a different canonical request payload', async () => {
    await service.execute({
      namespace, key: 'payload-mismatch-0001', request: { amount: 1 },
      operation: async () => ({ statusCode: 200, body: { ok: true } }),
    });
    await expect(service.execute({
      namespace, key: 'payload-mismatch-0001', request: { amount: 2 },
      operation: async () => ({ statusCode: 200, body: { ok: false } }),
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
  });

  it('recovers an expired claim after a rolled-back operation', async () => {
    const key = 'expired-claim-retry-01';
    await expect(service.execute({
      namespace, key, request: { stable: true },
      operation: async () => { throw new Error('simulated crash'); },
    })).rejects.toThrow('simulated crash');
    await prisma.idempotencyRecord.update({
      where: { namespace_key: { namespace, key } },
      data: { leaseExpiresAt: new Date(0) },
    });
    await expect(service.execute({
      namespace, key, request: { stable: true },
      operation: async () => ({ statusCode: 200, body: { recovered: true } }),
    })).resolves.toMatchObject({ replayed: false, body: { recovered: true } });
  });
});
