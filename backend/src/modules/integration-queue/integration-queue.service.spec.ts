import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { IntegrationQueueError } from './integration-queue.error';
import { IntegrationQueueService } from './integration-queue.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('IntegrationQueueService', () => {
  const dlqJob = {
    id: 'job-1',
    type: IntegrationJobType.EMAIL,
    status: IntegrationJobStatus.DLQ as IntegrationJobStatus,
    payload: { userId: 'user-1' },
    lastError: 'SMTP unavailable',
    attempts: 10,
    nextRetryAt: null,
    createdAt: new Date('2026-09-14T08:00:00.000Z'),
    updatedAt: new Date('2026-09-14T08:00:00.000Z'),
  };

  function createService(overrides?: {
    readonly adminUiEnabled?: boolean;
    readonly existing?: typeof dlqJob | null;
  }) {
    const pending = {
      ...dlqJob,
      status: IntegrationJobStatus.PENDING,
      attempts: 0,
      lastError: null,
    };
    const repository = {
      listByStatus: jest.fn().mockResolvedValue([dlqJob]),
      findById: jest.fn().mockResolvedValue(overrides?.existing ?? dlqJob),
      resetForAdminRetry: jest.fn().mockResolvedValue(pending),
    };
    const settingsService = {
      getSetting: jest.fn(async (key: string) => {
        if (key === 'private.integrations.queue.adminUiEnabled') {
          return overrides?.adminUiEnabled !== false;
        }
        if (key === 'private.integrations.queue.enabled') {
          return true;
        }
        if (key === 'private.integrations.queue.typesCsv') {
          return 'email,edge,teams';
        }
        if (key.endsWith('Attempts') || key.endsWith('Seconds') || key.endsWith('Days')) {
          return 10;
        }
        return undefined;
      }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new IntegrationQueueService(
        repository as never,
        settingsService as never,
        queue as never,
      ),
      repository,
      queue,
    };
  }

  it('lists jobs for an admin status', async () => {
    const { service } = createService();
    const listed = await service.list(IntegrationJobStatus.DLQ);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe(IntegrationJobStatus.DLQ);
  });

  it('resets a DLQ job to PENDING and re-enqueues it', async () => {
    const { service, repository, queue } = createService();
    const retried = await service.retryNow('job-1');
    expect(repository.resetForAdminRetry).toHaveBeenCalledWith('job-1');
    expect(queue.add).toHaveBeenCalledWith(
      IntegrationJobType.EMAIL,
      { integrationJobId: 'job-1' },
      expect.objectContaining({
        jobId: expect.stringContaining('job-1:admin:'),
      }),
    );
    expect(retried.status).toBe(IntegrationJobStatus.PENDING);
    expect(retried.attempts).toBe(0);
  });

  it('rejects retry of a completed job', async () => {
    const { service } = createService({
      existing: { ...dlqJob, status: IntegrationJobStatus.COMPLETED },
    });
    await expect(service.retryNow('job-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
    await expect(service.retryNow('job-1')).rejects.toBeInstanceOf(
      IntegrationQueueError,
    );
  });

  it('rejects admin APIs when the admin UI setting is off', async () => {
    const { service } = createService({ adminUiEnabled: false });
    await expect(service.list(IntegrationJobStatus.DLQ)).rejects.toMatchObject({
      code: 'ADMIN_UI_DISABLED',
    });
  });
});
