import { IntegrationJobType } from '../../generated/prisma/enums';
import {
  handleIntegrationJobFailure,
  resolveIntegrationJobFailureCode,
} from './handle-integration-job-failure';
import { IntegrationJobPayloadLimitError } from './integration-job-payload-limits';
import { MailDeliverySuppressedError } from '../notifications/email/mail-provider-limit-breaker';
import { NotificationEmailOutcomeUnknownError } from '../notifications/email/notification-email-delivery-errors';
import { TeamsDeliveryOutcomeUnknownError } from '../teams/teams-delivery-outcome-unknown.error';
import type { IntegrationJobProcessingClaim } from './integration-queue.types';

function processingClaim(
  overrides: Partial<IntegrationJobProcessingClaim> = {},
): IntegrationJobProcessingClaim {
  return {
    id: 'job-1',
    type: IntegrationJobType.EMAIL,
    payload: undefined,
    attempts: 1,
    version: 1,
    processingAttemptId: 'job-1',
    processingOwnerToken: 'owner-1',
    processingLeaseExpiresAt: new Date('2026-10-08T12:05:00.000Z'),
    ...overrides,
  };
}

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
      markFailed: jest.fn().mockResolvedValue(true),
      markDeadLetter: jest.fn(),
      scheduleEmailDeliveryRetry: jest.fn().mockResolvedValue(1),
      markEmailDeliveryDead: jest.fn().mockResolvedValue(1),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const log = jest.fn();
    const payload = {
      userId: 'user-1',
      toAddress: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
      templateKey: 'ticket.message',
      dedupeKey: 'ticket.message:1',
    };
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: processingClaim({ attempts: 1, payload }),
        settings,
        error: new Error('SMTP unavailable'),
        log,
      }),
    ).resolves.toBe('FAILED');
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1', processingOwnerToken: 'owner-1' }),
      // BA-integration-queue-13: a stable code is persisted, never raw text.
      'MAIL_SEND_FAILED_TRANSIENT',
      expect.any(Date),
    );
    expect(queue.add).toHaveBeenCalledWith(
      IntegrationJobType.EMAIL,
      { integrationJobId: 'job-1' },
      expect.objectContaining({ jobId: 'job-1:1', delay: 60_000 }),
    );
    expect(repository.scheduleEmailDeliveryRetry).toHaveBeenCalledWith(
      payload,
      repository.markFailed.mock.calls[0]?.[2],
    );
    expect(repository.scheduleEmailDeliveryRetry.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(repository.markFailed.mock.calls[0]?.[2]).toBeInstanceOf(Date);
    expect(repository.markDeadLetter).not.toHaveBeenCalled();
  });

  it('leaves a due FAILED row recoverable when the retry enqueue fails', async () => {
    const repository = {
      markFailed: jest.fn().mockResolvedValue(true),
      markDeadLetter: jest.fn(),
      scheduleEmailDeliveryRetry: jest.fn().mockResolvedValue(1),
      markEmailDeliveryDead: jest.fn(),
    };
    const queue = { add: jest.fn().mockRejectedValue(new Error('Redis unavailable')) };
    const payload = {
      userId: 'user-1',
      toAddress: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
      templateKey: 'ticket.message',
      dedupeKey: 'ticket.message:1',
    };

    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: processingClaim({ attempts: 1, payload }),
        settings,
        error: new Error('SMTP unavailable'),
        log: jest.fn(),
      }),
    ).rejects.toThrow('Redis unavailable');

    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1', processingOwnerToken: 'owner-1' }),
      // BA-integration-queue-13: a stable code is persisted, never raw text.
      'MAIL_SEND_FAILED_TRANSIENT',
      expect.any(Date),
    );
    expect(repository.scheduleEmailDeliveryRetry).toHaveBeenCalledWith(
      payload,
      repository.markFailed.mock.calls[0]?.[2],
    );
  });

  it('moves the job and delivery ledger to DLQ once the attempt threshold is reached', async () => {
    const repository = {
      markFailed: jest.fn(),
      markDeadLetter: jest.fn().mockResolvedValue(true),
      scheduleEmailDeliveryRetry: jest.fn(),
      markEmailDeliveryDead: jest.fn().mockResolvedValue(1),
    };
    const queue = { add: jest.fn() };
    const payload = {
      userId: 'user-1',
      toAddress: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
      templateKey: 'ticket.message',
      dedupeKey: 'ticket.message:1',
    };
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: processingClaim({ attempts: 3, payload }),
        settings,
        error: new Error('SMTP unavailable'),
        log: jest.fn(),
      }),
    ).resolves.toBe('DLQ');
    expect(repository.markEmailDeliveryDead).toHaveBeenCalledWith(payload);
    expect(repository.markDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1', processingOwnerToken: 'owner-1' }),
      'MAIL_SEND_FAILED_TRANSIENT',
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('odbijenu adresu primaoca šalje odmah u DLQ (ponavljanje ne pomaže)', async () => {
    const repository = {
      markFailed: jest.fn(),
      markDeadLetter: jest.fn().mockResolvedValue(true),
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
        job: processingClaim({ attempts: 1 }),
        settings,
        error,
        log: jest.fn(),
      }),
    ).resolves.toBe('DLQ');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('ograničenje provajdera (dnevni limit) ostaje na uobičajenom backoffu', async () => {
    const repository = {
      markFailed: jest.fn().mockResolvedValue(true),
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
        job: processingClaim({ attempts: 1 }),
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
      markFailed: jest.fn().mockResolvedValue(true),
      markDeadLetter: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: processingClaim({ type: IntegrationJobType.EDGE_EVENT, attempts: 1 }),
        settings,
        error: new Error('550 5.1.1 user unknown'),
        log: jest.fn(),
      }),
    ).resolves.toBe('FAILED');
  });

  it('stops an ambiguous email job without resending and moves the queue item to DLQ', async () => {
    const repository = {
      markFailed: jest.fn(),
      markDeadLetter: jest.fn().mockResolvedValue(true),
      scheduleEmailDeliveryRetry: jest.fn(),
      markEmailDeliveryDead: jest.fn().mockResolvedValue(0),
    };
    const queue = { add: jest.fn() };
    const payload = {
      userId: 'user-1',
      toAddress: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
      templateKey: 'ticket.message',
      dedupeKey: 'ticket.message:1',
    };

    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: processingClaim({ attempts: 1, payload }),
        settings,
        error: new NotificationEmailOutcomeUnknownError(),
        log: jest.fn(),
      }),
    ).resolves.toBe('DLQ');

    expect(repository.markEmailDeliveryDead).toHaveBeenCalledWith(payload);
    expect(repository.markDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1', processingOwnerToken: 'owner-1' }),
      'PROVIDER_DELIVERY_OUTCOME_UNKNOWN',
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('quarantines uncertain Teams delivery without enqueuing another send', async () => {
    const repository = { markDeadLetter: jest.fn().mockResolvedValue(true), markFailed: jest.fn(), markEmailDeliveryDead: jest.fn() };
    const queue = { add: jest.fn() };
    await expect(handleIntegrationJobFailure({ repository: repository as never, queue: queue as never, job: processingClaim({ type: IntegrationJobType.TEAMS }), settings, error: new TeamsDeliveryOutcomeUnknownError(), log: jest.fn() })).resolves.toBe('DLQ');
    expect(repository.markDeadLetter).toHaveBeenCalledWith(expect.any(Object), 'PROVIDER_DELIVERY_OUTCOME_UNKNOWN');
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('ne mijenja retry ledger niti re-enqueueuje kada failure CAS izgubi claim', async () => {
    const repository = {
      markFailed: jest.fn().mockResolvedValue(false),
      markDeadLetter: jest.fn(),
      scheduleEmailDeliveryRetry: jest.fn(),
      markEmailDeliveryDead: jest.fn(),
    };
    const queue = { add: jest.fn() };

    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: processingClaim({ attempts: 1, payload: { userId: 'user-1' } }),
        settings,
        error: new Error('stale worker failure'),
        log: jest.fn(),
      }),
    ).resolves.toBe('STALE');

    expect(repository.scheduleEmailDeliveryRetry).not.toHaveBeenCalled();
    expect(repository.markEmailDeliveryDead).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('ne mijenja email ledger kada DLQ CAS izgubi claim', async () => {
    const repository = {
      markFailed: jest.fn(),
      markDeadLetter: jest.fn().mockResolvedValue(false),
      scheduleEmailDeliveryRetry: jest.fn(),
      markEmailDeliveryDead: jest.fn(),
    };
    const queue = { add: jest.fn() };

    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: processingClaim({
          attempts: 1,
          payload: { userId: 'user-1' },
        }),
        settings,
        error: new NotificationEmailOutcomeUnknownError(),
        log: jest.fn(),
      }),
    ).resolves.toBe('STALE');

    expect(repository.markEmailDeliveryDead).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('zaustavljeno slanje (prekidač) čeka kraj blokade umjesto da troši pokušaje', async () => {
    const repository = {
      markFailed: jest.fn().mockResolvedValue(true),
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
        job: processingClaim({ attempts: 1 }),
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
      markFailed: jest.fn().mockResolvedValue(true),
      markDeadLetter: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    await expect(
      handleIntegrationJobFailure({
        repository: repository as never,
        queue: queue as never,
        job: processingClaim({ attempts: 1 }),
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

describe('resolveIntegrationJobFailureCode (BA-integration-queue-13)', () => {
  it('never persists raw provider text with addresses or response bodies', () => {
    const code = resolveIntegrationJobFailureCode(
      Object.assign(new Error('550 mailbox unavailable for user@example.com: full'), {
        responseCode: 550,
      }),
      IntegrationJobType.EMAIL,
    );
    expect(code).toBe('MAIL_SEND_FAILED_RECIPIENT');
    expect(code).not.toContain('@');
  });

  it('maps stable special cases and falls back to the generic code', () => {
    expect(
      resolveIntegrationJobFailureCode(
        new IntegrationJobPayloadLimitError(),
        IntegrationJobType.TEAMS,
      ),
    ).toBe('INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED');
    expect(
      resolveIntegrationJobFailureCode(
        new TeamsDeliveryOutcomeUnknownError(),
        IntegrationJobType.TEAMS,
      ),
    ).toBe('PROVIDER_DELIVERY_OUTCOME_UNKNOWN');
    expect(
      resolveIntegrationJobFailureCode(
        new Error('socket hang up to hooks.example.com/secret'),
        IntegrationJobType.TEAMS,
      ),
    ).toBe('INTEGRATION_JOB_FAILED');
  });
});
