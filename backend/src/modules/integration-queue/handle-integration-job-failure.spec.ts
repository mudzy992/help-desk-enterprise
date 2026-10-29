import { IntegrationJobType } from '../../generated/prisma/enums';
import { handleIntegrationJobFailure } from './handle-integration-job-failure';
import { MailDeliverySuppressedError } from '../notifications/email/mail-provider-limit-breaker';

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

  it('odbijenu adresu primaoca šalje odmah u DLQ (ponavljanje ne pomaže)', async () => {
    const repository = {
      markFailed: jest.fn(),
      markDeadLetter: jest.fn().mockResolvedValue(undefined),
    };
    const queue = { add: jest.fn() };
    const error = Object.assign(
      new Error('Recipient command failed: 550 5.1.1 The email account that you tried to reach does not exist'),
      { code: 'EENVELOPE', responseCode: 550, response: '550 5.1.1 The email account that you tried to reach does not exist' },
    );
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: { id: 'job-1', type: IntegrationJobType.EMAIL, attempts: 1 },
        settings,
        error,
        log: jest.fn(),
      }),
    ).resolves.toBe('DLQ');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('ograničenje provajdera (dnevni limit) ostaje na uobičajenom backoffu', async () => {
    const repository = {
      markFailed: jest.fn().mockResolvedValue(undefined),
      markDeadLetter: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const error = Object.assign(
      new Error('Data command failed: 550-5.4.5 Daily user sending limit exceeded.'),
      { code: 'EENVELOPE', responseCode: 550, response: '550-5.4.5 Daily user sending limit exceeded.' },
    );
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: { id: 'job-1', type: IntegrationJobType.EMAIL, attempts: 1 },
        settings,
        error,
        log: jest.fn(),
      }),
    ).resolves.toBe('FAILED');
    expect(repository.markDeadLetter).not.toHaveBeenCalled();
    // Sirovo odbijanje provajdera (nije greška prekidača) ide uobičajenim putem.
    expect(queue.add).toHaveBeenCalledWith(
      IntegrationJobType.EMAIL,
      { integrationJobId: 'job-1' },
      expect.objectContaining({ delay: 60_000 }),
    );
  });

  it('odbijena adresa kod ne-mail posla ne preskače backoff', async () => {
    const repository = {
      markFailed: jest.fn().mockResolvedValue(undefined),
      markDeadLetter: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: { id: 'job-1', type: IntegrationJobType.EDGE_EVENT, attempts: 1 },
        settings,
        error: new Error('550 5.1.1 user unknown'),
        log: jest.fn(),
      }),
    ).resolves.toBe('FAILED');
  });

  it('zaustavljeno slanje (prekidač) čeka kraj blokade umjesto da troši pokušaje', async () => {
    const repository = {
      markFailed: jest.fn().mockResolvedValue(undefined),
      markDeadLetter: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const nowMs = Date.now();
    const error = new MailDeliverySuppressedError(
      { reason: 'dailyLimit', blockedUntilMs: nowMs + 3_600_000 },
      nowMs,
    );
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: { id: 'job-1', type: IntegrationJobType.EMAIL, attempts: 1 },
        settings,
        error,
        log: jest.fn(),
      }),
    ).resolves.toBe('FAILED');
    expect(repository.markDeadLetter).not.toHaveBeenCalled();
    // 3600 s blokade + 60 s rezerve, a ne 60 s backoffa koji bi odmah opet pao.
    expect(queue.add).toHaveBeenCalledWith(
      IntegrationJobType.EMAIL,
      { integrationJobId: 'job-1' },
      expect.objectContaining({ delay: 3_660_000 }),
    );
  });

  it('prepoznaje zaustavljeno slanje i po kodu greške (EPROVIDERBLOCKED)', async () => {
    const repository = {
      markFailed: jest.fn().mockResolvedValue(undefined),
      markDeadLetter: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: { id: 'job-1', type: IntegrationJobType.EMAIL, attempts: 1 },
        settings,
        error: Object.assign(new Error('Outbound mail is paused'), {
          code: 'EPROVIDERBLOCKED',
          retryAfterSeconds: 120,
        }),
        log: jest.fn(),
      }),
    ).resolves.toBe('FAILED');
    expect(queue.add).toHaveBeenCalledWith(
      IntegrationJobType.EMAIL,
      { integrationJobId: 'job-1' },
      expect.objectContaining({ delay: 180_000 }),
    );
  });
});
