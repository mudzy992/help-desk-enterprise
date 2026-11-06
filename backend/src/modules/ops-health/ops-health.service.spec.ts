jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));
jest.mock('../integration-queue/integration-queue.constants', () => ({ workerHeartbeatRedisKey: 'worker:heartbeat:test' }));
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
import {
  readTemplatesConfigurationHealth,
  recordTemplatesConfigurationReadFailure,
  recordTemplatesConfigurationReadRecovery,
} from '../templates/templates-configuration-health';
import { notificationTicketMessageFanOutTopic } from '../notifications/fan-out/notification-fan-out-outbox.constants';

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
    notificationEmailDelivery: {
      findFirst: jest.fn(async () => null),
      count: jest.fn(async (_args?: unknown) => 0),
    },
    inboundMailboxState: {
      findUnique: jest.fn(async () => ({ lastRunAt: now, lastSuccessAt: null, lastError: 'AUTHENTICATIONFAILED', lastErrorAt: now, consecutiveFails: 4 })),
    },
    outboxMessage: {
      count: jest.fn(async (_args?: unknown): Promise<number> => 0),
      findFirst: jest.fn(async (_args?: unknown): Promise<{ createdAt: Date } | null> => null),
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

  it('surfaces unknown notification email outcomes for operator reconciliation', async () => {
    const { service, prisma } = setup();
    prisma.notificationEmailDelivery.count.mockImplementation(async (args?: unknown) => {
      const where = (args as { where: { status: string } } | undefined)?.where;
      const counts: Record<string, number> = {
        UNKNOWN: 2,
        PENDING: 3,
        FAILED: 4,
        DEAD: 1,
      };
      return counts[where?.status ?? ''] ?? 0;
    });

    const overview = await service.overview(now);

    expect(overview.components.email).toMatchObject({
      stuckClaims: 0,
      unknownDeliveries: 2,
      pendingRetries: 3,
      failedDeliveries: 4,
      deadDeliveries: 1,
    });
    expect(prisma.notificationEmailDelivery.count).toHaveBeenCalledWith({
      where: { status: 'UNKNOWN' },
    });
    expect(prisma.notificationEmailDelivery.count).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
    });
    expect(prisma.notificationEmailDelivery.count).toHaveBeenCalledWith({
      where: { status: 'FAILED' },
    });
    expect(prisma.notificationEmailDelivery.count).toHaveBeenCalledWith({
      where: { status: 'DEAD' },
    });
  });

  it('surfaces template settings read failures and recovery in the protected health overview', async () => {
    const { service } = setup();
    recordTemplatesConfigurationReadRecovery(now);
    const degraded = recordTemplatesConfigurationReadFailure(now);

    await expect(service.overview(now)).resolves.toMatchObject({
      components: { templatesConfiguration: degraded },
    });

    const recovered = recordTemplatesConfigurationReadRecovery(
      new Date(now.getTime() + 1_000),
    );
    await expect(service.overview(now)).resolves.toMatchObject({
      components: { templatesConfiguration: recovered },
    });
    expect(readTemplatesConfigurationHealth().status).toBe('ok');
  });

  it('reports change downtime outbox backlog and degrades on dead-letter work', async () => {
    const { service, prisma } = setup();
    prisma.outboxMessage.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    prisma.outboxMessage.findFirst.mockResolvedValueOnce({ createdAt: new Date(now.getTime() - 60_000) });
    expect((await service.overview(now)).components.changeDowntimeSync).toEqual({
      status: 'ok',
      pending: 2,
      processing: 1,
      deadLetter: 0,
      oldestPendingAgeMs: 60_000,
    });

    prisma.outboxMessage.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    prisma.outboxMessage.findFirst.mockResolvedValueOnce(null);
    expect((await service.overview(now)).components.changeDowntimeSync).toMatchObject({ status: 'degraded', deadLetter: 1 });
  });

  it('reports ticket side-effect outbox backlog and degrades on dead-letter work', async () => {
    const { service, prisma } = setup();
    let deadLetter = 0;
    prisma.outboxMessage.count.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { topic: { in?: string[] } | string; status: string } }).where;
      if (typeof where.topic === 'string' || !where.topic.in?.includes('ticket.playbook.auto-attach')) return 0;
      if (where.status === 'PENDING') return 2;
      if (where.status === 'PROCESSING') return 1;
      return deadLetter;
    });
    prisma.outboxMessage.findFirst.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { topic: { in?: string[] } | string } }).where;
      return typeof where.topic !== 'string' && where.topic.in?.includes('ticket.playbook.auto-attach')
        ? { createdAt: new Date(now.getTime() - 60_000) }
        : null;
    });

    expect((await service.overview(now)).components.ticketSideEffectOutbox).toEqual({
      status: 'ok',
      pending: 2,
      processing: 1,
      deadLetter: 0,
      oldestPendingAgeMs: 60_000,
    });

    deadLetter = 1;
    expect((await service.overview(now)).components.ticketSideEffectOutbox).toMatchObject({
      status: 'degraded',
      deadLetter: 1,
    });
  });

  it('reports notification fan-out outbox backlog and dead-letter recovery state', async () => {
    const { service, prisma } = setup();
    let deadLetter = 0;
    prisma.outboxMessage.count.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { topic: string | { in?: string[] }; status: string } }).where;
      if (where.topic !== notificationTicketMessageFanOutTopic) return 0;
      if (where.status === 'PENDING') return 2;
      if (where.status === 'PROCESSING') return 1;
      return deadLetter;
    });
    prisma.outboxMessage.findFirst.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { topic: string | { in?: string[] } } }).where;
      return where.topic === notificationTicketMessageFanOutTopic
        ? { createdAt: new Date(now.getTime() - 60_000) }
        : null;
    });

    expect((await service.overview(now)).components.notificationFanOutOutbox).toEqual({
      status: 'ok',
      pending: 2,
      processing: 1,
      deadLetter: 0,
      oldestPendingAgeMs: 60_000,
    });

    deadLetter = 1;
    expect((await service.overview(now)).components.notificationFanOutOutbox).toMatchObject({
      status: 'degraded',
      deadLetter: 1,
    });
  });

  it('returns an unknown change downtime signal when the outbox health query fails', async () => {
    const { service, prisma } = setup();
    prisma.outboxMessage.count.mockRejectedValueOnce(new Error('outbox table unavailable'));

    await expect(service.overview(now)).resolves.toMatchObject({
      components: { changeDowntimeSync: null },
    });
  });

  it('surfaces an absent assets scheduler and its last-success gate in the health overview', async () => {
    const { service, redis } = setup();
    redis.values.set(
      'ops:snapshot',
      JSON.stringify({
        generatedAt: now.toISOString(),
        signals: {
          assetOperations: {
            directorySyncOverlapsLastHour: 3,
            auditWriteFailuresLastHour: 1,
            importStuckClaims: 0,
            overAllocatedLicenseCount: 1,
            overAllocatedSeatCount: 2,
            failedReminderDeliveries: 0,
            staleReminderClaims: 0,
            pendingTransferFilePurges: 0,
            staleTransferFilePurges: 0,
            oldestTransferFilePurgeAgeMinutes: null,
            transferFileScanState: 'limited',
            scannedTransferFiles: null,
            referencedTransferFiles: null,
            orphanedTransferFiles: null,
            missingTransferFiles: null,
          },
          schedulers: [
            {
              queue: 'asset-directory-sync',
              schedulerId: 'asset-directory-sync-hourly',
              everyMs: null,
              pattern: '23 * * * *',
              nextMs: null,
              lastSuccessMs: now.getTime() - 80 * 60_000,
              lastFailureMs: null,
              registered: false,
              lastSuccessMaxAgeMs: 75 * 60_000,
            },
          ],
          queues: [],
        },
        lateJobs: [
          {
            queue: 'asset-directory-sync',
            schedulerId: 'asset-directory-sync-hourly',
            reason: 'not_registered',
            minutesLate: 80,
          },
        ],
        dlqGrowth: null,
        httpSeries: [],
      }),
    );

    const overview = await service.overview(now);
    expect(overview.assetOperations).toMatchObject({
      directorySyncOverlapsLastHour: 3,
      auditWriteFailuresLastHour: 1,
      transferFileScanState: 'limited',
      orphanedTransferFiles: null,
    });
    expect(overview.schedulers).toEqual([
      expect.objectContaining({
        queue: 'asset-directory-sync',
        schedulerId: 'asset-directory-sync-hourly',
        registered: false,
        lastSuccessAt: new Date(now.getTime() - 80 * 60_000).toISOString(),
        lastSuccessMaxAgeMs: 75 * 60_000,
        state: 'late',
      }),
    ]);
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
