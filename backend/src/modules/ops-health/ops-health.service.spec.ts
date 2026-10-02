jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));
jest.mock('../inbound-email/inbound-email-configuration', () => ({
  loadInboundEmailConfiguration: jest.fn(async () => ({ enabled: true })),
  inboundMailboxKey: jest.fn(() => 'imap:helpdesk@example.com'),
}));
jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn(async () => undefined) }));

import { NotFoundException } from '@nestjs/common';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { OpsHealthService } from './ops-health.service';
import { loadInboundEmailConfiguration } from '../inbound-email/inbound-email-configuration';
import { workerHeartbeatRedisKey } from '../integration-queue/integration-queue.constants';
import { fallbackOpsConfiguration } from './ops-configuration.loader';

const now = new Date('2026-11-20T10:00:00.000Z');
const actor = { principal: { subjectId: 'admin-1', email: 'a@x.ba', displayName: 'Admin', isLocalOnly: false }, requestId: 'r1', sessionId: 's1' };

function memoryRedis() {
  const values = new Map<string, string>();
  return {
    values,
    get: async (key: string) => values.get(key) ?? null,
    set: jest.fn(async (key: string, value: string) => (values.set(key, value), 'OK')),
    del: async (key: string) => (values.delete(key) ? 1 : 0),
    ping: async () => 'PONG',
  };
}

const alertRow = {
  id: 'a1',
  key: 'disk.usage',
  severity: 'WARNING',
  status: 'ACKNOWLEDGED',
  details: { usedPercent: 83 },
  firstSeenAt: now,
  lastSeenAt: now,
  resolvedAt: null,
  acknowledgedAt: now,
  acknowledgedByUserId: 'admin-1',
  notifyCount: 1,
};

function setup() {
  const redis = memoryRedis();
  const transaction = {
    opsAlert: { updateMany: jest.fn(async () => ({ count: 1 })), findUnique: jest.fn(async () => alertRow) },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (tx: unknown) => unknown) => work(transaction)),
    user: { findMany: jest.fn(async () => [{ id: 'admin-1', displayName: 'Admin' }]) },
    integrationJob: { count: jest.fn(async () => 3) },
    $queryRaw: jest.fn(async () => [{ '?column?': 1 }]),
    opsAlert: { findMany: jest.fn(async () => []) },
    notificationEmailDelivery: { findFirst: jest.fn(async () => null) },
    inboundMailboxState: {
      findUnique: jest.fn(async () => ({ lastRunAt: now, lastSuccessAt: null, lastError: 'AUTHENTICATIONFAILED', lastErrorAt: now, consecutiveFails: 4 })),
    },
  };
  const engine = { sendTest: jest.fn(async () => [{ channel: 'email', status: 'sent', delivered: 2, failed: 0, reason: null }]) };
  const loader = { load: jest.fn(async () => fallbackOpsConfiguration) };
  const service = new OpsHealthService(prisma as never, { getClient: () => redis } as never, loader as never, engine as never, {} as never);
  return { redis, prisma, transaction, engine, service };
}

describe('OpsHealthService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('acknowledges a firing alarm once and audits it', async () => {
    const { service, transaction } = setup();
    const view = await service.acknowledge('a1', actor, now);
    expect(transaction.opsAlert.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', status: 'FIRING' },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: now, acknowledgedByUserId: 'admin-1' },
    });
    expect(view).toMatchObject({ status: 'ACKNOWLEDGED', acknowledgedBy: 'Admin', runbook: 'ops/runbook/ALERTS.md#disk-usage' });
    expect(recordAuditEntry).toHaveBeenCalledWith(transaction, expect.objectContaining({ action: 'ops.alert.acknowledged', entityId: 'a1' }));
    transaction.opsAlert.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.acknowledge('a1', actor, now);
    expect(recordAuditEntry).toHaveBeenCalledTimes(1);
  });

  it('reports the worker in the card vocabulary (active / stale / unknown)', async () => {
    const { service, redis } = setup();
    expect((await service.overview(now)).components.worker).toEqual({ status: 'unknown', heartbeatAgeSeconds: null });
    redis.values.set(workerHeartbeatRedisKey, new Date(now.getTime() - 10_000).toISOString());
    expect((await service.overview(now)).components.worker).toEqual({ status: 'active', heartbeatAgeSeconds: 10 });
    redis.values.set(workerHeartbeatRedisKey, new Date(now.getTime() - 600_000).toISOString());
    expect((await service.overview(now)).components.worker.status).toBe('stale');
  });

  it('shows only the configured inbound mailbox, with its last error, and nothing while inbound is off', async () => {
    const { service, prisma } = setup();
    expect((await service.overview(now)).components.inbound).toEqual([
      {
        mailboxKey: 'imap:helpdesk@example.com',
        lastRunAt: now.toISOString(),
        lastSuccessAt: null,
        lastError: 'AUTHENTICATIONFAILED',
        lastErrorAt: now.toISOString(),
        consecutiveFails: 4,
      },
    ]);
    expect(prisma.inboundMailboxState.findUnique).toHaveBeenCalledWith({ where: { mailboxKey: 'imap:helpdesk@example.com' } });
    (loadInboundEmailConfiguration as jest.Mock).mockResolvedValueOnce({ enabled: false });
    expect((await service.overview(now)).components.inbound).toEqual([]);
  });

  it('rejects an unknown alarm', async () => {
    const { service, transaction } = setup();
    transaction.opsAlert.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.acknowledge('nope', actor, now)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('silences with a TTL and audit, and unsilences', async () => {
    const { service, redis } = setup();
    const view = await service.silence(60, 'Planirano održavanje servera', actor, now);
    expect(view).toEqual({ until: '2026-11-20T11:00:00.000Z', reason: 'Planirano održavanje servera', by: 'Admin' });
    expect(redis.set).toHaveBeenCalledWith('ops:silence', expect.any(String), 'PX', 3_600_000);
    expect(recordAuditEntry).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ops.alerts.silenced', metadata: expect.objectContaining({ minutes: 60 }) }));
    expect(await service.unsilence(actor)).toEqual({ cleared: true });
    expect(await service.unsilence(actor)).toEqual({ cleared: false });
    expect(recordAuditEntry).toHaveBeenCalledTimes(2);
  });

  it('acknowledges the DLQ from the latest snapshot', async () => {
    const { service, redis } = setup();
    await expect(service.acknowledgeDlq(actor)).rejects.toBeInstanceOf(NotFoundException);
    redis.values.set('ops:snapshot', JSON.stringify({ generatedAt: now.toISOString(), signals: { queues: [{ queue: 'integration', failed: 7 }] } }));
    expect(await service.acknowledgeDlq(actor)).toEqual({ integrationDlq: 3, failedByQueue: { integration: 7 } });
    expect(JSON.parse(redis.values.get('ops:baseline:dlq')!)).toEqual({ integrationDlq: 3, failedByQueue: { integration: 7 } });
  });

  it('sends a test and audits the channel outcome only', async () => {
    const { service } = setup();
    expect(await service.sendTest(actor)).toEqual({ channels: [{ channel: 'email', status: 'sent', delivered: 2, failed: 0, reason: null }] });
    expect(recordAuditEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'ops.alert.test_sent', metadata: { channels: [{ channel: 'email', status: 'sent', delivered: 2 }] } }),
    );
  });
});
