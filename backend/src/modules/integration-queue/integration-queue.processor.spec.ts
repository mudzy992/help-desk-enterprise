import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { integrationJobProcessingLeaseDurationMilliseconds } from './integration-queue.constants';
import { IntegrationQueueProcessor } from './integration-queue.processor';
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';
import type { IntegrationJobProcessingClaim } from './integration-queue.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('./load-integration-queue-settings', () => ({
  loadIntegrationQueueSettings: jest.fn().mockResolvedValue({
    enabled: true,
    typeTokens: new Set(['email', 'edge', 'teams']),
    maxAttempts: 3,
    initialBackoffSeconds: 1,
    maxBackoffSeconds: 10,
    deadLetterAfterAttempts: 3,
    deadLetterRetentionDays: 30,
    workerPollSeconds: 5,
    adminUiEnabled: true,
  }),
}));
jest.mock('./process-email-integration-job.service', () => ({
  ProcessEmailIntegrationJobService: class ProcessEmailIntegrationJobService {},
}));
jest.mock('./process-edge-event-integration-job.service', () => ({
  ProcessEdgeEventIntegrationJobService: class ProcessEdgeEventIntegrationJobService {},
}));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));
jest.mock('../teams/teams-delivery.service', () => ({
  TeamsDeliveryService: class TeamsDeliveryService {},
}));

function processingClaim(input: {
  readonly id: string;
  readonly type: IntegrationJobType;
  readonly payload: unknown;
}): IntegrationJobProcessingClaim {
  return {
    ...input,
    attempts: 1,
    version: 1,
    processingAttemptId: input.id,
    processingOwnerToken: 'owner-token',
    processingLeaseExpiresAt: new Date('2026-10-08T12:05:00.000Z'),
  };
}

function createHarness(input: {
  readonly claim: IntegrationJobProcessingClaim | null;
}) {
  const repository = {
    findTypeAndStatus: jest.fn().mockResolvedValue(
      input.claim === null
        ? null
        : { type: input.claim.type, status: IntegrationJobStatus.PENDING },
    ),
    claimForProcessing: jest.fn().mockResolvedValue(input.claim),
    markCompleted: jest.fn().mockResolvedValue(true),
    markPublishedBestEffort: jest.fn().mockResolvedValue(true),
    markSkipped: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn().mockResolvedValue(true),
    markDeadLetter: jest.fn().mockResolvedValue(true),
  };
  const settingsService = {
    getSetting: jest.fn(async (key: string) => {
      if (key.includes('enabled') || key.includes('Enabled')) return true;
      if (key.includes('typesCsv')) return 'email,edge,teams';
      return 10;
    }),
  };
  const processEmail = { process: jest.fn().mockResolvedValue(undefined) };
  const processEdge = { process: jest.fn().mockResolvedValue(undefined) };
  const processTeams = { process: jest.fn().mockResolvedValue(undefined) };
  const queue = { add: jest.fn() };
  const processor = new IntegrationQueueProcessor(
    repository as never,
    settingsService as never,
    processEmail as never,
    processEdge as never,
    processTeams as never,
    queue as never,
  );
  return { processor, repository, processEmail, processEdge, processTeams, queue };
}

describe('IntegrationQueueProcessor', () => {
  it('pauses a runtime-disabled type before claiming, consuming no attempt', async () => {
    const claim = processingClaim({
      id: 'job-paused',
      type: IntegrationJobType.TEAMS,
      payload: { target: 'personal' },
    });
    const harness = createHarness({ claim });
    (loadIntegrationQueueSettings as jest.Mock).mockResolvedValueOnce({
      enabled: true,
      typeTokens: new Set(['email', 'edge']),
      maxAttempts: 3,
      initialBackoffSeconds: 1,
      maxBackoffSeconds: 10,
      deadLetterAfterAttempts: 3,
      deadLetterRetentionDays: 30,
      workerPollSeconds: 5,
      adminUiEnabled: true,
    });

    await harness.processor.process({
      id: 'job-paused',
      data: { integrationJobId: 'job-paused' },
    } as never);

    expect(harness.repository.findTypeAndStatus).toHaveBeenCalledWith('job-paused');
    expect(harness.repository.claimForProcessing).not.toHaveBeenCalled();
    expect(harness.processTeams.process).not.toHaveBeenCalled();
    expect(harness.repository.markFailed).not.toHaveBeenCalled();
    expect(harness.repository.markDeadLetter).not.toHaveBeenCalled();
  });

  it('pauses every type while the queue itself is disabled', async () => {
    const claim = processingClaim({
      id: 'job-queue-paused',
      type: IntegrationJobType.EMAIL,
      payload: { userId: 'user-1' },
    });
    const harness = createHarness({ claim });
    (loadIntegrationQueueSettings as jest.Mock).mockResolvedValueOnce({
      enabled: false,
      typeTokens: new Set(['email', 'edge', 'teams']),
      maxAttempts: 3,
      initialBackoffSeconds: 1,
      maxBackoffSeconds: 10,
      deadLetterAfterAttempts: 3,
      deadLetterRetentionDays: 30,
      workerPollSeconds: 5,
      adminUiEnabled: true,
    });

    await harness.processor.process({
      id: 'job-queue-paused',
      data: { integrationJobId: 'job-queue-paused' },
    } as never);

    expect(harness.repository.claimForProcessing).not.toHaveBeenCalled();
    expect(harness.processEmail.process).not.toHaveBeenCalled();
  });

  it('uses the BullMQ attempt id and only dispatches after winning a fenced claim', async () => {
    const record = {
      id: 'job-1',
      type: IntegrationJobType.EMAIL,
      status: IntegrationJobStatus.PROCESSING,
      payload: { userId: 'user-1' },
    };
    const claim = processingClaim(record);
    const harness = createHarness({ claim });

    await harness.processor.process({
      id: 'job-1',
      data: { integrationJobId: 'job-1' },
    } as never);

    expect(harness.repository.claimForProcessing).toHaveBeenCalledWith({
      id: 'job-1',
      attemptId: 'job-1',
      ownerToken: expect.any(String),
      now: expect.any(Date),
      leaseExpiresAt: expect.any(Date),
    });
    const claimInput = harness.repository.claimForProcessing.mock.calls[0]?.[0];
    expect(claimInput.leaseExpiresAt.getTime() - claimInput.now.getTime()).toBe(
      integrationJobProcessingLeaseDurationMilliseconds,
    );
    expect(harness.processEmail.process).toHaveBeenCalledWith(record.payload);
    expect(harness.processEdge.process).not.toHaveBeenCalled();
    expect(harness.processTeams.process).not.toHaveBeenCalled();
    expect(harness.repository.markCompleted).toHaveBeenCalledWith(claim);
    expect(harness.queue.add).not.toHaveBeenCalled();
  });

  it.each([IntegrationJobType.EMAIL, IntegrationJobType.EDGE_EVENT, IntegrationJobType.TEAMS])('dead-letters oversized %s payloads before parsers and delivery', async (type) => {
    const claim = processingClaim({ id: 'large', type, payload: { text: 'x'.repeat(2 * 1024 * 1024 + 1) } });
    const harness = createHarness({ claim });
    await harness.processor.process({ id: 'large', data: { integrationJobId: 'large' } } as never);
    expect(harness.repository.markDeadLetter).toHaveBeenCalledWith(claim, 'INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED');
    expect(harness.processEmail.process).not.toHaveBeenCalled();
    expect(harness.processEdge.process).not.toHaveBeenCalled();
    expect(harness.processTeams.process).not.toHaveBeenCalled();
    expect(harness.queue.add).not.toHaveBeenCalled();
    expect(harness.repository.markCompleted).not.toHaveBeenCalled();
  });

  it('dispatches a TEAMS job only after its claim and marks that claim completed', async () => {
    const record = {
      id: 'job-2',
      type: IntegrationJobType.TEAMS,
      status: IntegrationJobStatus.PROCESSING,
      payload: {
        target: 'personal',
        teamsConversationId: 'tc-1',
        notificationId: 'n-1',
      },
    };
    const claim = processingClaim(record);
    const harness = createHarness({ claim });

    await harness.processor.process({
      id: 'job-2',
      data: { integrationJobId: 'job-2' },
    } as never);

    expect(harness.processTeams.process).toHaveBeenCalledWith(record.payload);
    expect(harness.processEmail.process).not.toHaveBeenCalled();
    expect(harness.repository.markCompleted).toHaveBeenCalledWith(claim);
  });

  it.each([
    ['skipped', 'TEAMS_DELIVERY_SKIPPED'],
    ['gone', 'TEAMS_CONVERSATION_GONE'],
    ['permanent_failure', 'TEAMS_DELIVERY_PERMANENT_FAILURE'],
  ] as const)(
    'BA-integration-queue-14: marks a Teams %s outcome SKIPPED, never COMPLETED',
    async (outcome, code) => {
      const claim = processingClaim({
        id: 'job-teams-skipped',
        type: IntegrationJobType.TEAMS,
        payload: { target: 'personal', teamsConversationId: 'tc-1', notificationId: 'n-1' },
      });
      const harness = createHarness({ claim });
      harness.processTeams.process.mockResolvedValue(outcome);

      await harness.processor.process({
        id: 'job-teams-skipped',
        data: { integrationJobId: 'job-teams-skipped' },
      } as never);

      expect(harness.repository.markSkipped).toHaveBeenCalledWith(claim, code);
      expect(harness.repository.markCompleted).not.toHaveBeenCalled();
    },
  );

  it('records a Redis publication as PUBLISHED_BEST_EFFORT, never COMPLETED', async () => {
    const claim = processingClaim({
      id: 'job-edge-published',
      type: IntegrationJobType.EDGE_EVENT,
      payload: { userId: 'user-1', eventName: 'ticket.updated', data: {} },
    });
    const harness = createHarness({ claim });
    harness.processEdge.process.mockResolvedValue(
      IntegrationJobStatus.PUBLISHED_BEST_EFFORT,
    );

    await harness.processor.process({
      id: 'job-edge-published',
      data: { integrationJobId: 'job-edge-published' },
    } as never);

    expect(harness.processEdge.process).toHaveBeenCalledWith(claim.payload);
    expect(harness.repository.markPublishedBestEffort).toHaveBeenCalledWith(claim);
    expect(harness.repository.markCompleted).not.toHaveBeenCalled();
    expect(harness.repository.markFailed).not.toHaveBeenCalled();
    expect(harness.queue.add).not.toHaveBeenCalled();
  });

  it('sends a zero-subscriber Edge event through retryable FAILED handling', async () => {
    const claim = processingClaim({
      id: 'job-edge-no-subscribers',
      type: IntegrationJobType.EDGE_EVENT,
      payload: { userId: 'user-1', eventName: 'ticket.updated', data: {} },
    });
    const harness = createHarness({ claim });
    harness.processEdge.process.mockRejectedValue(
      new Error('EDGE_EVENT_NO_SUBSCRIBERS'),
    );

    await harness.processor.process({
      id: 'job-edge-no-subscribers',
      data: { integrationJobId: 'job-edge-no-subscribers' },
    } as never);

    expect(harness.repository.markFailed).toHaveBeenCalledWith(
      claim,
      'EDGE_EVENT_NO_SUBSCRIBERS',
      expect.any(Date),
    );
    expect(harness.queue.add).toHaveBeenCalledWith(
      IntegrationJobType.EDGE_EVENT,
      { integrationJobId: 'job-edge-no-subscribers' },
      expect.objectContaining({ jobId: 'job-edge-no-subscribers:1', delay: 1_000 }),
    );
    expect(harness.repository.markCompleted).not.toHaveBeenCalled();
    expect(harness.repository.markPublishedBestEffort).not.toHaveBeenCalled();
  });

  it('does not dispatch a duplicate or stale BullMQ delivery when its claim loses', async () => {
    const harness = createHarness({ claim: null });

    await harness.processor.process({
      id: 'job-1',
      data: { integrationJobId: 'job-1' },
    } as never);

    expect(harness.processEmail.process).not.toHaveBeenCalled();
    expect(harness.processEdge.process).not.toHaveBeenCalled();
    expect(harness.processTeams.process).not.toHaveBeenCalled();
    expect(harness.repository.markCompleted).not.toHaveBeenCalled();
  });
});
