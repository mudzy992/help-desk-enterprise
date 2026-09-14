import { IntegrationJobType } from '../../generated/prisma/enums';
import { handleIntegrationJobFailure } from './handle-integration-job-failure';

describe('handleIntegrationJobFailure', () => {
  const settings = {
    enabled: true,
    typeTokens: new Set(['email']),
    maxAttempts: 3,
    initialBackoffSeconds: 60,
    maxBackoffSeconds: 3600,
    deadLetterAfterAttempts: 3,
    deadLetterRetentionDays: 30,
    workerPollSeconds: 5,
    adminUiEnabled: true,
  };

  it('re-enqueues with backoff while attempts remain', async () => {
    const repository = {
      markFailed: jest.fn().mockResolvedValue(undefined),
      markDeadLetter: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const log = jest.fn();
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: { id: 'job-1', type: IntegrationJobType.EMAIL, attempts: 1 },
        settings,
        error: new Error('SMTP unavailable'),
        log,
      }),
    ).resolves.toBe('FAILED');
    expect(repository.markFailed).toHaveBeenCalledWith(
      'job-1',
      'SMTP unavailable',
      expect.any(Date),
    );
    expect(queue.add).toHaveBeenCalledWith(
      IntegrationJobType.EMAIL,
      { integrationJobId: 'job-1' },
      expect.objectContaining({ jobId: 'job-1:1', delay: 60_000 }),
    );
    expect(repository.markDeadLetter).not.toHaveBeenCalled();
  });

  it('moves the job to DLQ once the attempt threshold is reached', async () => {
    const repository = {
      markFailed: jest.fn(),
      markDeadLetter: jest.fn().mockResolvedValue(undefined),
    };
    const queue = { add: jest.fn() };
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: { id: 'job-1', type: IntegrationJobType.EMAIL, attempts: 3 },
        settings,
        error: new Error('SMTP unavailable'),
        log: jest.fn(),
      }),
    ).resolves.toBe('DLQ');
    expect(repository.markDeadLetter).toHaveBeenCalledWith(
      'job-1',
      'SMTP unavailable',
    );
    expect(queue.add).not.toHaveBeenCalled();
  });
});
