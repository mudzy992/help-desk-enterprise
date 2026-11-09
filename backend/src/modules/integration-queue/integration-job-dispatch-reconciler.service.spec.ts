import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { IntegrationJobDispatchReconcilerService } from './integration-job-dispatch-reconciler.service';
import { integrationQueueDispatchReconcileBatchSize } from './integration-queue.constants';

describe('IntegrationJobDispatchReconcilerService', () => {
  const now = new Date('2026-10-08T12:00:00.000Z');

  it('re-enqueues PENDING and due FAILED rows with stable logical-attempt ids', async () => {
    const jobs = [
      {
        id: 'pending-1',
        type: IntegrationJobType.EMAIL,
        status: IntegrationJobStatus.PENDING,
        attempts: 0,
      },
      {
        id: 'failed-1',
        type: IntegrationJobType.EDGE_EVENT,
        status: IntegrationJobStatus.FAILED,
        attempts: 3,
      },
    ];
    const repository = {
      listExpiredProcessingPage: jest.fn().mockResolvedValue([]),
      listDispatchablePage: jest.fn().mockResolvedValue(jobs),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new IntegrationJobDispatchReconcilerService(
      repository as never,
      queue as never,
    );

    await expect(service.sweep(now)).resolves.toEqual({
      processed: 2,
      failed: 0,
    });

    expect(repository.listDispatchablePage).toHaveBeenCalledWith(
      now,
      integrationQueueDispatchReconcileBatchSize,
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      IntegrationJobType.EMAIL,
      { integrationJobId: 'pending-1' },
      {
        jobId: 'pending-1',
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      IntegrationJobType.EDGE_EVENT,
      { integrationJobId: 'failed-1' },
      {
        jobId: 'failed-1:3',
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it('quarantines expired claims without enqueueing them and continues after failures', async () => {
    const claims = [{ id: 'stale' }, { id: 'raced' }, { id: 'db-failure' }];
    const repository = {
      listExpiredProcessingPage: jest.fn().mockResolvedValue(claims),
      quarantineExpiredProcessing: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('db')),
      listDispatchablePage: jest.fn().mockResolvedValue([]),
    };
    const queue = { add: jest.fn() };
    const service = new IntegrationJobDispatchReconcilerService(repository as never, queue as never);
    await expect(service.sweep(now)).resolves.toEqual({ processed: 3, failed: 1 });
    expect(repository.listExpiredProcessingPage).toHaveBeenCalledWith(now, integrationQueueDispatchReconcileBatchSize);
    expect(repository.quarantineExpiredProcessing).toHaveBeenCalledTimes(3);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('continues the bounded page after an enqueue error and reports failed dispatches', async () => {
    const repository = {
      listExpiredProcessingPage: jest.fn().mockResolvedValue([]),
      listDispatchablePage: jest.fn().mockResolvedValue([
        {
          id: 'pending-1',
          type: IntegrationJobType.EMAIL,
          status: IntegrationJobStatus.PENDING,
          attempts: 0,
        },
        {
          id: 'pending-2',
          type: IntegrationJobType.TEAMS,
          status: IntegrationJobStatus.PENDING,
          attempts: 0,
        },
      ]),
    };
    const queue = {
      add: jest
        .fn()
        .mockRejectedValueOnce(new Error('Redis unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const service = new IntegrationJobDispatchReconcilerService(
      repository as never,
      queue as never,
    );

    await expect(service.sweep(now)).resolves.toEqual({
      processed: 2,
      failed: 1,
    });
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      IntegrationJobType.TEAMS,
      { integrationJobId: 'pending-2' },
      expect.objectContaining({ jobId: 'pending-2' }),
    );
  });
});
