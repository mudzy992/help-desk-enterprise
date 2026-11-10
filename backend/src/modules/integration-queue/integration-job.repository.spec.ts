import 'reflect-metadata';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { integrationQueueAdminPageSize } from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('IntegrationJobRepository admin cursor pages', () => {
  function createRepository(rows: readonly unknown[]) {
    const prisma = {
      integrationJob: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    return {
      repository: new IntegrationJobRepository(prisma as never),
      findMany: prisma.integrationJob.findMany,
    };
  }

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
});
