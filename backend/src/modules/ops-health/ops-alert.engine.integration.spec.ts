/**
 * Paket 2.7 (§14): alarm engine against a real PostgreSQL (partial unique
 * index, notification claim, fallback adoption). Runs only when
 * PRIVACY_IT_DATABASE_URL points at a migrated, disposable database.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { OpsObservation } from './evaluate-ops-signals';
import { OpsAlertEngine } from './ops-alert.engine';
import type { OpsChannelResult } from './ops-alert-notifier.service';
import type { OpsAlertMessage } from './ops-alert-presentation';
import { fallbackOpsConfiguration } from './ops-configuration.loader';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;
const minute = 60_000;

function fakeRedis() {
  const values = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  return {
    options: { keyPrefix: '' },
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    del: async (key: string) => (values.delete(key) ? 1 : 0),
    hmget: async (key: string, ...fields: string[]) => fields.map((field) => hashes.get(key)?.get(field) ?? null),
    hset: async (key: string, ...flat: string[]) => {
      const hash = hashes.get(key) ?? new Map<string, string>();
      for (let index = 0; index < flat.length; index += 2) hash.set(flat[index]!, flat[index + 1]!);
      hashes.set(key, hash);
      return flat.length / 2;
    },
  };
}

type Sent = { message: OpsAlertMessage; dedupeKey: string };

describeIfDatabase('OpsAlertEngine (integration)', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaClient;
  let redis: ReturnType<typeof fakeRedis>;
  let sent: Sent[];
  let fallbackSent: OpsAlertMessage[];
  let deliver: boolean;
  let fallbackConfigured: boolean;

  const notifier = {
    notify: async (input: { message: OpsAlertMessage; dedupeKey: string }): Promise<OpsChannelResult[]> => {
      sent.push({ message: input.message, dedupeKey: input.dedupeKey });
      return [{ channel: 'email', status: deliver ? 'sent' : 'skipped', delivered: deliver ? 1 : 0, failed: 0, reason: deliver ? null : 'no_recipients' }];
    },
  };
  const fallback = {
    isConfigured: () => fallbackConfigured,
    notify: async (message: OpsAlertMessage) => {
      if (!fallbackConfigured) return [];
      fallbackSent.push(message);
      return ['email'];
    },
  };

  const engine = () => new OpsAlertEngine(prisma as never, { getClient: () => redis } as never, notifier as never, fallback as never);
  const disk = (active: boolean, severity: 'WARNING' | 'CRITICAL' = 'WARNING'): OpsObservation => ({
    key: 'disk.usage',
    active,
    severity,
    details: active ? { usedPercent: severity === 'CRITICAL' ? 93 : 83 } : {},
  });
  const context = (now: Date, overrides: Partial<Parameters<OpsAlertEngine['apply']>[1]> = {}) => ({
    configuration: fallbackOpsConfiguration,
    now,
    databaseAvailable: true,
    redisAvailable: true,
    ...overrides,
  });
  const rows = (key = 'disk.usage') => prisma.opsAlert.findMany({ where: { key }, orderBy: { createdAt: 'asc' } });

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });

  afterAll(async () => {
    await prisma.opsAlert.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.opsAlert.deleteMany({});
    redis = fakeRedis();
    sent = [];
    fallbackSent = [];
    deliver = true;
    fallbackConfigured = true;
  });

  it('opens after the streak, reminds, escalates and resolves - one row, one message per event', async () => {
    const subject = engine();
    const t0 = new Date('2026-11-20T08:00:00.000Z');
    await subject.apply([disk(true)], context(t0));
    expect(await rows()).toHaveLength(0);
    await subject.apply([disk(true)], context(new Date(t0.getTime() + minute)));
    let [row] = await rows();
    expect(row).toMatchObject({ status: 'FIRING', severity: 'WARNING', notifyCount: 1 });
    expect(sent.map((entry) => entry.message.kind)).toEqual(['opened']);
    expect(sent[0]!.dedupeKey).toBe(`ops-alert:${row!.id}:opened:1`);

    await subject.apply([disk(true)], context(new Date(t0.getTime() + 30 * minute)));
    expect(sent).toHaveLength(1);
    await subject.apply([disk(true)], context(new Date(t0.getTime() + minute + 4 * 3_600_000)));
    expect(sent.map((entry) => entry.message.kind)).toEqual(['opened', 'reminder']);

    await subject.apply([disk(true, 'CRITICAL')], context(new Date(t0.getTime() + 5 * 3_600_000)));
    [row] = await rows();
    expect(row).toMatchObject({ severity: 'CRITICAL', notifyCount: 3, details: { usedPercent: 93 } });

    await subject.apply([disk(false)], context(new Date(t0.getTime() + 6 * 3_600_000)));
    expect((await rows())[0]!.status).toBe('FIRING');
    await subject.apply([disk(false)], context(new Date(t0.getTime() + 6 * 3_600_000 + minute)));
    [row] = await rows();
    expect(row).toMatchObject({ status: 'RESOLVED', notifyCount: 4 });
    expect(sent.map((entry) => entry.message.kind)).toEqual(['opened', 'reminder', 'escalated', 'resolved']);
    expect(sent[3]!.message.severity).toBe('CRITICAL');

    // A new episode is a new row: the partial unique index only covers open ones.
    await subject.apply([disk(true)], context(new Date(t0.getTime() + 7 * 3_600_000)));
    await subject.apply([disk(true)], context(new Date(t0.getTime() + 7 * 3_600_000 + minute)));
    expect((await rows()).map((entry) => entry.status)).toEqual(['RESOLVED', 'FIRING']);
  });

  it('lets only one of two concurrent instances open and announce', async () => {
    const now = new Date('2026-11-20T09:00:00.000Z');
    const worker: OpsObservation = { key: 'worker.down', active: true, severity: 'CRITICAL', details: {} };
    await Promise.all([engine().apply([worker], context(now)), engine().apply([worker], context(now))]);
    expect(await rows('worker.down')).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('does not remind an acknowledged alarm', async () => {
    const subject = engine();
    const t0 = new Date('2026-11-20T08:00:00.000Z');
    const worker: OpsObservation = { key: 'worker.down', active: true, severity: 'CRITICAL', details: {} };
    await subject.apply([worker], context(t0));
    await prisma.opsAlert.updateMany({ where: { key: 'worker.down' }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: t0 } });
    await subject.apply([worker], context(new Date(t0.getTime() + 5 * 3_600_000)));
    expect(sent.map((entry) => entry.message.kind)).toEqual(['opened']);
  });

  it('keeps silent while silenced and sends the missed "opened" afterwards', async () => {
    const subject = engine();
    const t0 = new Date('2026-11-20T08:00:00.000Z');
    await redis.set('ops:silence', JSON.stringify({ until: new Date(t0.getTime() + 30 * minute).toISOString(), reason: 'patch', byUserId: 'u' }));
    await subject.apply([disk(true)], context(t0));
    await subject.apply([disk(true)], context(new Date(t0.getTime() + minute)));
    expect((await rows())[0]).toMatchObject({ status: 'FIRING', notifyCount: 0 });
    expect(sent).toHaveLength(0);
    await subject.apply([disk(true)], context(new Date(t0.getTime() + 31 * minute)));
    expect(sent.map((entry) => entry.message.kind)).toEqual(['opened']);
    expect((await rows())[0]!.notifyCount).toBe(1);
  });

  it('releases the claim when nothing was delivered and tries the env channel', async () => {
    deliver = false;
    fallbackConfigured = false;
    const subject = engine();
    const t0 = new Date('2026-11-20T08:00:00.000Z');
    const worker: OpsObservation = { key: 'worker.down', active: true, severity: 'CRITICAL', details: {} };
    await subject.apply([worker], context(t0));
    expect((await rows('worker.down'))[0]!.notifyCount).toBe(0);
    fallbackConfigured = true;
    await subject.apply([worker], context(new Date(t0.getTime() + minute)));
    expect(fallbackSent.map((message) => message.kind)).toEqual(['opened']);
    expect((await rows('worker.down'))[0]!.notifyCount).toBe(1);
  });

  it('announces through the env channel while the database is down and records it afterwards', async () => {
    const subject = engine();
    const t0 = new Date('2026-11-20T08:00:00.000Z');
    const down: OpsObservation = { key: 'database.unavailable', active: true, severity: 'CRITICAL', details: {} };
    const up: OpsObservation = { ...down, active: false };
    await subject.apply([down], context(t0, { databaseAvailable: false }));
    await subject.apply([down], context(new Date(t0.getTime() + minute), { databaseAvailable: false }));
    await subject.apply([down], context(new Date(t0.getTime() + 2 * minute), { databaseAvailable: false }));
    expect(fallbackSent.map((message) => message.kind)).toEqual(['opened']);
    expect(sent).toHaveLength(0);

    await subject.apply([up], context(new Date(t0.getTime() + 10 * minute)));
    const [row] = await rows('database.unavailable');
    expect(row).toMatchObject({ status: 'RESOLVED', notifyCount: 1, details: { deliveredVia: 'fallback' } });
    expect(row!.firstSeenAt.toISOString()).toBe(new Date(t0.getTime() + minute).toISOString());
    expect(sent.map((entry) => entry.message.kind)).toEqual(['resolved']);
  });

  it('adopts a fallback-announced alarm that is still active when the database returns', async () => {
    const subject = engine();
    const t0 = new Date('2026-11-20T08:00:00.000Z');
    const worker: OpsObservation = { key: 'worker.down', active: true, severity: 'CRITICAL', details: {} };
    await subject.apply([worker], context(t0, { databaseAvailable: false }));
    expect(fallbackSent).toHaveLength(1);
    await subject.apply([worker], context(new Date(t0.getTime() + minute)));
    expect(await rows('worker.down')).toHaveLength(1);
    expect((await rows('worker.down'))[0]).toMatchObject({ status: 'FIRING', notifyCount: 1 });
    expect(sent).toHaveLength(0);
    await subject.apply([{ ...worker, active: false }], context(new Date(t0.getTime() + 2 * minute)));
    await subject.apply([{ ...worker, active: false }], context(new Date(t0.getTime() + 3 * minute)));
    expect(sent.map((entry) => entry.message.kind)).toEqual(['resolved']);
  });
});
