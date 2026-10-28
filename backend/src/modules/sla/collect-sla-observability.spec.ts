import { collectSlaObservability } from './collect-sla-observability';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

describe('collectSlaObservability', () => {
  it('reports delivery, fan-out, scan, scheduler, drift and due-date integrity metrics', async () => {
    const now = new Date('2026-10-28T12:00:00Z');
    const outboxCount = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const stateCount = jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(3);
    const failureCount = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const queryRaw = jest.fn().mockResolvedValueOnce([{ maxSeconds: 12.5 }]).mockResolvedValueOnce([{ total: 2n }]);
    const prisma = {
      outboxMessage: { count: outboxCount, findFirst: jest.fn().mockResolvedValue({ createdAt: new Date('2026-10-28T11:58:00Z') }) },
      auditLog: { count: jest.fn().mockResolvedValue(3) },
      ticketSlaState: { count: stateCount, findFirst: jest.fn().mockResolvedValue({ nextDueAt: new Date('2026-10-28T11:55:00Z') }) },
      slaScanFailure: { count: failureCount },
      $queryRaw: queryRaw,
    };
    await expect(collectSlaObservability(prisma as never, { now, schedulerRegistered: false })).resolves.toEqual({
      transitionOutbox: { pending: 2, failed: 1, oldestPendingAgeSeconds: 120, maxDeliveryLatencySecondsLastHour: 12.5 },
      fanout: { emptyLastHour: 3, failedLastHour: 1 },
      scan: { dueBacklog: 4, oldestDueAgeSeconds: 300, retryPending: 2, quarantined: 1 },
      schedulerRegistered: false,
      configurationDrift: 3,
      invalidDueBeforeStart: 2,
    });
  });
});
