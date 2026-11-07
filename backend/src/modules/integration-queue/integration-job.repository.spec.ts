import 'reflect-metadata';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import {
  integrationQueueAdminPageSize,
  integrationQueueAdminStatuses,
} from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../audit-log/record-audit-entry', () => ({
  recordAuditEntry: jest.fn().mockResolvedValue(undefined),
}));

const adminPageSelection = {
  id: true,
  type: true,
  status: true,
  lastError: true,
  attempts: true,
  nextRetryAt: true,
  createdAt: true,
  updatedAt: true,
};

describe('IntegrationJobRepository admin cursor pages', () => {
  function createRepository(rows: readonly unknown[]) {
    const prisma = {
      integrationJob: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
      notificationEmailDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return {
      repository: new IntegrationJobRepository(prisma as never),
      findMany: prisma.integrationJob.findMany,
      updateDelivery: prisma.notificationEmailDelivery.updateMany,
    };
  }

  it('selects a bounded oldest-first page of PENDING and due FAILED rows', async () => {
    const { repository, findMany } = createRepository([]);
    const now = new Date('2026-10-08T12:00:00.000Z');

    await repository.listDispatchablePage(now, 100);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: IntegrationJobStatus.PENDING },
          {
            status: IntegrationJobStatus.FAILED,
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: now } },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, type: true, status: true, attempts: true },
    });
  });

  it('claims the expected logical attempt with a status/version/retry-time CAS', async () => {
    const now = new Date('2026-10-08T12:00:00.000Z');
    const leaseExpiresAt = new Date('2026-10-08T12:05:00.000Z');
    const existing = {
      ...row('job-claim'),
      type: IntegrationJobType.EDGE_EVENT,
      status: IntegrationJobStatus.PENDING,
      payload: { eventName: 'claim-test' },
      attempts: 0,
      version: 7,
    };
    const integrationJob = {
      findUnique: jest.fn().mockResolvedValue(existing),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const repository = new IntegrationJobRepository({ integrationJob } as never);

    await expect(
      repository.claimForProcessing({
        id: existing.id,
        attemptId: existing.id,
        ownerToken: 'owner-a',
        now,
        leaseExpiresAt,
      }),
    ).resolves.toMatchObject({
      id: existing.id,
      attempts: 1,
      version: 8,
      processingAttemptId: 'job-claim',
      processingOwnerToken: 'owner-a',
      processingLeaseExpiresAt: leaseExpiresAt,
    });
    expect(integrationJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-claim',
        status: IntegrationJobStatus.PENDING,
        version: 7,
        attempts: 0,
        nextRetryAt: null,
      },
      data: {
        status: IntegrationJobStatus.PROCESSING,
        attempts: { increment: 1 },
        version: { increment: 1 },
        processingAttemptId: 'job-claim',
        processingOwnerToken: 'owner-a',
        processingLeaseExpiresAt: leaseExpiresAt,
      },
    });
  });

  it('refuses a future retry and a stale BullMQ attempt id before updating', async () => {
    const now = new Date('2026-10-08T12:00:00.000Z');
    const future = new Date('2026-10-08T12:01:00.000Z');
    const existing = {
      ...row('job-retry'),
      status: IntegrationJobStatus.FAILED,
      attempts: 3,
      version: 5,
      nextRetryAt: future,
    };
    const integrationJob = {
      findUnique: jest.fn().mockResolvedValue(existing),
      updateMany: jest.fn(),
    };
    const repository = new IntegrationJobRepository({ integrationJob } as never);

    await expect(
      repository.claimForProcessing({
        id: existing.id,
        attemptId: `${existing.id}:3`,
        ownerToken: 'owner-a',
        now,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      }),
    ).resolves.toBeNull();
    expect(integrationJob.updateMany).not.toHaveBeenCalled();

    existing.nextRetryAt = new Date('2026-10-08T11:59:00.000Z');
    integrationJob.findUnique.mockResolvedValue(existing);
    await expect(
      repository.claimForProcessing({
        id: existing.id,
        attemptId: `${existing.id}:2`,
        ownerToken: 'owner-b',
        now,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      }),
    ).resolves.toBeNull();
    expect(integrationJob.updateMany).not.toHaveBeenCalled();
  });

  it('fences completion by status, version, attempt id, and owner token', async () => {
    const claim = {
      id: 'job-claim',
      type: IntegrationJobType.EDGE_EVENT,
      payload: { eventName: 'claim-test' },
      attempts: 2,
      version: 9,
      processingAttemptId: 'job-claim:1',
      processingOwnerToken: 'owner-a',
      processingLeaseExpiresAt: new Date('2026-10-08T12:05:00.000Z'),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = new IntegrationJobRepository({
      integrationJob: { updateMany },
    } as never);

    await expect(repository.markCompleted(claim)).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-claim',
        status: IntegrationJobStatus.PROCESSING,
        version: 9,
        attempts: 2,
        processingAttemptId: 'job-claim:1',
        processingOwnerToken: 'owner-a',
        processingLeaseExpiresAt: claim.processingLeaseExpiresAt,
      },
      data: {
        status: IntegrationJobStatus.COMPLETED,
        lastError: null,
        nextRetryAt: null,
        version: { increment: 1 },
        processingAttemptId: null,
        processingOwnerToken: null,
        processingLeaseExpiresAt: null,
      },
    });
  });

  it('claim-fences the explicit best-effort outcome for EDGE_EVENT jobs', async () => {
    const claim = {
      id: 'job-edge-best-effort',
      type: IntegrationJobType.EDGE_EVENT,
      payload: { eventName: 'claim-test' },
      attempts: 2,
      version: 9,
      processingAttemptId: 'job-edge-best-effort:1',
      processingOwnerToken: 'owner-a',
      processingLeaseExpiresAt: new Date('2026-10-08T12:05:00.000Z'),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new IntegrationJobRepository({
      integrationJob: { updateMany },
    } as never);

    await expect(repository.markPublishedBestEffort(claim)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: claim.id,
        status: IntegrationJobStatus.PROCESSING,
        version: claim.version,
        attempts: claim.attempts,
        processingAttemptId: claim.processingAttemptId,
        processingOwnerToken: claim.processingOwnerToken,
        processingLeaseExpiresAt: claim.processingLeaseExpiresAt,
      },
      data: {
        status: IntegrationJobStatus.PUBLISHED_BEST_EFFORT,
        lastError: null,
        nextRetryAt: null,
        version: { increment: 1 },
        processingAttemptId: null,
        processingOwnerToken: null,
        processingLeaseExpiresAt: null,
      },
    });
  });

  it('does not allow PUBLISHED_BEST_EFFORT for non-Edge jobs', () => {
    const updateMany = jest.fn();
    const repository = new IntegrationJobRepository({
      integrationJob: { updateMany },
    } as never);

    expect(() =>
      repository.markPublishedBestEffort({
        id: 'job-email',
        type: IntegrationJobType.EMAIL,
        payload: {},
        attempts: 1,
        version: 1,
        processingAttemptId: 'job-email',
        processingOwnerToken: 'owner-a',
        processingLeaseExpiresAt: new Date('2026-10-08T12:05:00.000Z'),
      }),
    ).toThrow('PUBLISHED_BEST_EFFORT is only valid for EDGE_EVENT jobs');
    expect(updateMany).not.toHaveBeenCalled();
  });

  function row(id: string) {
    const createdAt = new Date('2026-10-08T12:00:00.000Z');
    return {
      id,
      type: IntegrationJobType.EMAIL,
      status: IntegrationJobStatus.DLQ,
      payload: { safe: true },
      lastError: null,
      attempts: 2,
      version: 0,
      processingAttemptId: null,
      processingOwnerToken: null,
      processingLeaseExpiresAt: null,
      nextRetryAt: null,
      createdAt,
      updatedAt: createdAt,
    };
  }

  it('includes PUBLISHED_BEST_EFFORT in the supported admin status filters', async () => {
    expect(integrationQueueAdminStatuses).toContain(
      IntegrationJobStatus.PUBLISHED_BEST_EFFORT,
    );
    const published = {
      ...row('job-best-effort'),
      type: IntegrationJobType.EDGE_EVENT,
      status: IntegrationJobStatus.PUBLISHED_BEST_EFFORT,
    };
    const { repository, findMany } = createRepository([published]);

    await expect(
      repository.listByStatusPage(
        IntegrationJobStatus.PUBLISHED_BEST_EFFORT,
        null,
      ),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({
        id: published.id,
        status: IntegrationJobStatus.PUBLISHED_BEST_EFFORT,
      })],
      nextCursor: null,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: IntegrationJobStatus.PUBLISHED_BEST_EFFORT },
        select: adminPageSelection,
      }),
    );
  });

  it('orders by created time and id, fetches one look-ahead row and returns the last visible id', async () => {
    // Equal timestamps exercise the deterministic id tiebreaker in the query.
    const rows = Array.from({ length: integrationQueueAdminPageSize + 1 }, (_, index) =>
      row(`job-${String(1000 - index).padStart(4, '0')}`),
    );
    const { repository, findMany } = createRepository(rows);

    const page = await repository.listByStatusPage(IntegrationJobStatus.DLQ, null);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: IntegrationJobStatus.DLQ },
      select: adminPageSelection,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: integrationQueueAdminPageSize + 1,
    });
    expect(page.items).toHaveLength(integrationQueueAdminPageSize);
    expect(page.items[0]?.id).toBe('job-1000');
    expect(page.items.at(-1)?.id).toBe('job-0951');
    expect(page.nextCursor).toBe('job-0951');
  });

  it('uses the previous row as an opaque cursor and has no next cursor on the last page', async () => {
    const { repository, findMany } = createRepository([row('job-next')]);

    const page = await repository.listByStatusPage(
      IntegrationJobStatus.FAILED,
      'job-previous',
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { status: IntegrationJobStatus.FAILED },
      select: adminPageSelection,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: integrationQueueAdminPageSize + 1,
      cursor: { id: 'job-previous' },
      skip: 1,
    });
    expect(page.items.map((item: { readonly id: string }) => item.id)).toEqual(['job-next']);
    expect(page.nextCursor).toBeNull();
  });

  it('returns an empty page without querying for an unsupported status', async () => {
    const { repository, findMany } = createRepository([]);

    await expect(
      repository.listByStatusPage('UNSUPPORTED' as IntegrationJobStatus, null),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('atomically resets admin retry state, email ledger, and audit evidence', async () => {
    const createdAt = new Date('2026-10-08T12:00:00.000Z');
    const payload = {
      userId: 'user-1',
      toAddress: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
      templateKey: 'ticket.message',
      dedupeKey: 'ticket.message:1',
    };
    const existing = {
      ...row('job-1'),
      status: IntegrationJobStatus.DLQ,
      payload,
      attempts: 5,
      createdAt,
      updatedAt: createdAt,
    };
    const pending = {
      ...existing,
      status: IntegrationJobStatus.PENDING,
      attempts: 0,
      lastError: null,
      nextRetryAt: null,
      version: existing.version + 1,
      processingAttemptId: null,
      processingOwnerToken: null,
      processingLeaseExpiresAt: null,
    };
    const transaction = {
      integrationJob: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(pending),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationEmailDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work(transaction),
      ),
    };
    const repository = new IntegrationJobRepository(prisma as never);

    await expect(
      repository.resetForAdminRetry('job-1', 'admin-1'),
    ).resolves.toEqual(pending);

    expect(transaction.integrationJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        status: IntegrationJobStatus.DLQ,
        version: existing.version,
        attempts: existing.attempts,
        nextRetryAt: existing.nextRetryAt,
      },
      data: {
        status: IntegrationJobStatus.PENDING,
        attempts: 0,
        lastError: null,
        nextRetryAt: null,
        version: { increment: 1 },
        processingAttemptId: null,
        processingOwnerToken: null,
        processingLeaseExpiresAt: null,
      },
    });
    expect(transaction.notificationEmailDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        dedupeKey: 'ticket.message:1',
        status: { in: ['PENDING', 'FAILED', 'DEAD'] },
      },
      data: { status: 'PENDING', nextRetryAt: null },
    });
    expect(recordAuditEntry).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: 'integration.job.retried',
        entityType: 'integration_job',
        entityId: 'job-1',
        actorUserId: 'admin-1',
        metadata: {
          fromStatus: IntegrationJobStatus.DLQ,
          previousAttempts: 5,
          toStatus: IntegrationJobStatus.PENDING,
        },
      }),
    );
  });

  it('mirrors the integration queue retry time to the email delivery ledger', async () => {
    const { repository, updateDelivery } = createRepository([]);
    const payload = {
      userId: 'user-1',
      toAddress: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
      templateKey: 'ticket.message',
      dedupeKey: 'ticket.message:1',
    };
    const nextRetryAt = new Date('2026-10-08T12:01:00.000Z');

    await repository.scheduleEmailDeliveryRetry(payload, nextRetryAt);

    expect(updateDelivery).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        dedupeKey: 'ticket.message:1',
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: { status: 'PENDING', nextRetryAt },
    });
  });

  it('does not look up an email delivery for a malformed or non-email payload', async () => {
    const { repository, updateDelivery } = createRepository([]);

    await repository.scheduleEmailDeliveryRetry({ unsupported: true }, new Date());
    await repository.markEmailDeliveryDead({ unsupported: true });

    expect(updateDelivery).not.toHaveBeenCalled();
  });
});
