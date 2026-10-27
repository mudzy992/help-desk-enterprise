import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { withTicketSlaWriteLock } from './with-ticket-sla-write-lock';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('SLA write coordination (integration)', () => {
  jest.setTimeout(120_000);
  let first: PrismaClient;
  let second: PrismaClient;

  beforeAll(() => {
    first = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    second = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });
  afterAll(async () => Promise.all([first.$disconnect(), second.$disconnect()]));

  it('serializes scanner and lifecycle work for the same ticket', async () => {
    let active = 0;
    let maximumActive = 0;
    const enter = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 100));
      active -= 1;
    };
    await Promise.all([
      withTicketSlaWriteLock(first as never, 'ticket-concurrency-proof', enter),
      withTicketSlaWriteLock(second as never, 'ticket-concurrency-proof', enter),
    ]);
    expect(maximumActive).toBe(1);
  });

  it('does not globally serialize unrelated tickets', async () => {
    let active = 0;
    let maximumActive = 0;
    const enter = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 100));
      active -= 1;
    };
    await Promise.all([
      withTicketSlaWriteLock(first as never, 'ticket-independent-a', enter),
      withTicketSlaWriteLock(second as never, 'ticket-independent-b', enter),
    ]);
    expect(maximumActive).toBe(2);
  });
});
