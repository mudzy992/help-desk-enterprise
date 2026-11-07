import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { integrationJobProcessingLeaseDurationMilliseconds } from './integration-queue.constants';
import { IntegrationQueueProcessor } from './integration-queue.processor';
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
    claimForProcessing: jest.fn().mockResolvedValue(input.claim),
    markCompleted: jest.fn().mockResolvedValue(true),
    markPublishedBestEffort: jest.fn().mockResolvedValue(true),
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
