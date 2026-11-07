import 'reflect-metadata';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { integrationQueueAdminPageSize } from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../audit-log/record-audit-entry', () => ({
  recordAuditEntry: jest.fn().mockResolvedValue(undefined),
}));

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

  function row(id: string) {
    const createdAt = new Date('2026-10-08T12:00:00.000Z');
    return {
      id,
      type: IntegrationJobType.EMAIL,
      status: IntegrationJobStatus.DLQ,
      payload: { safe: true },
      lastError: null,
      attempts: 2,
      nextRetryAt: null,
      createdAt,
      updatedAt: createdAt,
    };
  }

  it('orders by created time and id, fetches one look-ahead row and returns the last visible id', async () => {
    // Equal timestamps exercise the deterministic id tiebreaker in the query.
    const rows = Array.from({ length: integrationQueueAdminPageSize + 1 }, (_, index) =>
      row(`job-${String(1000 - index).padStart(4, '0')}`),
    );
    const { repository, findMany } = createRepository(rows);

    const page = await repository.listByStatusPage(IntegrationJobStatus.DLQ, null);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: IntegrationJobStatus.DLQ },
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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: integrationQueueAdminPageSize + 1,
      cursor: { id: 'job-previous' },
      skip: 1,
    });
    expect(page.items.map((item) => item.id)).toEqual(['job-next']);
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
      where: { id: 'job-1', status: IntegrationJobStatus.DLQ },
      data: {
        status: IntegrationJobStatus.PENDING,
        attempts: 0,
        lastError: null,
        nextRetryAt: null,
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
