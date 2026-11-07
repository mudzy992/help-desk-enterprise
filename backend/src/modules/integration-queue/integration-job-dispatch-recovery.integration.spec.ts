import { PrismaPg } from '@prisma/adapter-pg';
import { Queue } from 'bullmq';
import { PrismaClient } from '../../generated/prisma/client';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { EnqueueIntegrationJobService } from './enqueue-integration-job.service';
import { handleIntegrationJobFailure } from './handle-integration-job-failure';
import { IntegrationJobDispatchReconcilerService } from './integration-job-dispatch-reconciler.service';
import { IntegrationJobRepository } from './integration-job.repository';
import { IntegrationQueueService } from './integration-queue.service';
import type { IntegrationQueueSettings } from './integration-queue.types';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

const settings: IntegrationQueueSettings = {
  enabled: true,
  typeTokens: new Set(['email', 'edge', 'teams']),
  maxAttempts: 3,
  initialBackoffSeconds: 1,
  maxBackoffSeconds: 1,
  deadLetterAfterAttempts: 3,
  deadLetterRetentionDays: 30,
  workerPollSeconds: 1,
  adminUiEnabled: true,
};

function fakeSettingsService() {
  return {
    getSetting: async (key: string) => {
      if (key.endsWith('enabled') || key.endsWith('adminUiEnabled')) return true;
      if (key.endsWith('typesCsv')) return 'email,edge,teams';
      if (
        key.endsWith('Attempts') ||
        key.endsWith('Seconds') ||
        key.endsWith('Days')
      ) {
        return 10;
      }
      return undefined;
    },
  };
}

describeIfDatabase(
  'integration-job dispatch reconciliation (PostgreSQL integration, BA-integration-queue-01)',
  () => {
    jest.setTimeout(120_000);
    let prisma: PrismaClient;
    let repository: IntegrationJobRepository;
    let userId: string;
    const jobIds: string[] = [];
    const deliveryKeys: string[] = [];
    const stamp = Date.now();

    beforeAll(async () => {
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
      repository = new IntegrationJobRepository(prisma as never);
      const user = await prisma.user.create({
        data: {
          email: `integration-queue-${stamp}@example.test`,
          displayName: 'Integration queue recovery',
        },
      });
      userId = user.id;
    });

    afterEach(async () => {
      if (jobIds.length > 0) {
        await prisma.integrationJob.deleteMany({
          where: { id: { in: [...jobIds] } },
        });
        jobIds.length = 0;
      }
      if (deliveryKeys.length > 0) {
        await prisma.notificationEmailDelivery.deleteMany({
          where: { userId, dedupeKey: { in: [...deliveryKeys] } },
        });
        deliveryKeys.length = 0;
      }
    });

    afterAll(async () => {
      await prisma.notificationEmailDelivery.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      await prisma.$disconnect();
    });

    it('recovers an enqueue gap and a due retry with stable attempt ids', async () => {
      const initialQueue = {
        add: jest.fn().mockRejectedValue(new Error('injected Redis add failure')),
      };
      const enqueuer = new EnqueueIntegrationJobService(
        repository as never,
        initialQueue as never,
      );
      const pending = await enqueuer.enqueue({
        type: IntegrationJobType.EDGE_EVENT,
        payload: {
          userId: 'integration-test-user',
          eventName: `queue-gap-${stamp}`,
          data: { test: true },
        },
      });
      jobIds.push(pending.id);
      await expect(
        prisma.integrationJob.findUniqueOrThrow({ where: { id: pending.id } }),
      ).resolves.toMatchObject({ status: IntegrationJobStatus.PENDING });

      const retry = await repository.createPending({
        type: IntegrationJobType.EDGE_EVENT,
        payload: {
          userId: 'integration-test-user',
          eventName: `queue-retry-gap-${stamp}`,
          data: { test: true },
        } as never,
      });
      jobIds.push(retry.id);
      const processing = await repository.markProcessing(retry.id);
      const retryQueue = {
        add: jest.fn().mockRejectedValue(new Error('injected Redis retry failure')),
      };
      await expect(
        handleIntegrationJobFailure({
          repository,
          queue: retryQueue as never,
          job: {
            id: processing.id,
            type: processing.type,
            attempts: processing.attempts,
            payload: processing.payload,
          },
          settings,
          error: new Error('transient provider failure'),
          log: jest.fn(),
        }),
      ).rejects.toThrow('injected Redis retry failure');
      const failed = await prisma.integrationJob.findUniqueOrThrow({
        where: { id: retry.id },
      });
      expect(failed).toMatchObject({
        status: IntegrationJobStatus.FAILED,
        attempts: 1,
        nextRetryAt: expect.any(Date),
      });

      const notDue = await repository.createPending({
        type: IntegrationJobType.EDGE_EVENT,
        payload: {
          userId: 'integration-test-user',
          eventName: `queue-not-due-${stamp}`,
          data: { test: true },
        } as never,
      });
      jobIds.push(notDue.id);
      await prisma.integrationJob.update({
        where: { id: notDue.id },
        data: {
          status: IntegrationJobStatus.FAILED,
          attempts: 1,
          nextRetryAt: new Date(failed.nextRetryAt!.getTime() + 60_000),
        },
      });

      const recoveredQueue = { add: jest.fn().mockResolvedValue(undefined) };
      const reconciler = new IntegrationJobDispatchReconcilerService(
        repository as never,
        recoveredQueue as never,
      );
      const result = await reconciler.sweep(failed.nextRetryAt!);

      expect(result).toEqual({ processed: 2, failed: 0 });
      expect(recoveredQueue.add).toHaveBeenCalledWith(
        IntegrationJobType.EDGE_EVENT,
        { integrationJobId: pending.id },
        expect.objectContaining({ jobId: pending.id }),
      );
      expect(recoveredQueue.add).toHaveBeenCalledWith(
        IntegrationJobType.EDGE_EVENT,
        { integrationJobId: retry.id },
        expect.objectContaining({ jobId: `${retry.id}:1` }),
      );

      // A retry with the same durable state produces the same BullMQ id, so a
      // lost enqueue acknowledgement cannot create a second logical attempt.
      await reconciler.sweep(failed.nextRetryAt!);
      expect(recoveredQueue.add.mock.calls.map((call) => call[2]?.jobId)).toEqual([
        pending.id,
        `${retry.id}:1`,
        pending.id,
        `${retry.id}:1`,
      ]);
    });

    it('commits admin retry state, e-mail ledger, and hash-chained audit before dispatch recovery', async () => {
      const dedupeKey = `queue-admin-retry-${stamp}`;
      deliveryKeys.push(dedupeKey);
      const job = await repository.createPending({
        type: IntegrationJobType.EMAIL,
        payload: {
          userId,
          toAddress: 'integration-queue@example.test',
          subject: 'Integration queue retry test',
          text: 'Test only',
          templateKey: 'ticket.message',
          dedupeKey,
        } as never,
      });
      jobIds.push(job.id);
      await prisma.notificationEmailDelivery.create({
        data: {
          userId,
          dedupeKey,
          toAddress: 'integration-queue@example.test',
          templateKey: 'ticket.message',
          status: 'DEAD',
        },
      });
      await repository.markDeadLetter(job.id, 'test-only failure');

      const queue = {
        add: jest.fn().mockRejectedValue(new Error('injected Redis admin-retry failure')),
      };
      const service = new IntegrationQueueService(
        repository as never,
        fakeSettingsService() as never,
        queue as unknown as Queue,
        { getClient: () => ({ get: jest.fn() }) } as never,
      );

      await expect(service.retryNow(job.id, 'integration-test-admin')).resolves.toMatchObject({
        id: job.id,
        status: IntegrationJobStatus.PENDING,
        attempts: 0,
      });
      const stored = await prisma.integrationJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(stored).toMatchObject({
        status: IntegrationJobStatus.PENDING,
        attempts: 0,
        lastError: null,
        nextRetryAt: null,
      });
      await expect(
        prisma.notificationEmailDelivery.findUniqueOrThrow({
          where: { userId_dedupeKey: { userId, dedupeKey } },
        }),
      ).resolves.toMatchObject({ status: 'PENDING', nextRetryAt: null });
      expect(queue.add).toHaveBeenCalledWith(
        IntegrationJobType.EMAIL,
        { integrationJobId: job.id },
        expect.objectContaining({ jobId: job.id }),
      );

      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'integration.job.retried',
          entityType: 'integration_job',
          entityId: job.id,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { action: true, actorUserId: true, metadata: true },
      });
      expect(audit).toMatchObject({
        action: 'integration.job.retried',
        actorUserId: 'integration-test-admin',
        metadata: {
          fromStatus: IntegrationJobStatus.DLQ,
          previousAttempts: 0,
          toStatus: IntegrationJobStatus.PENDING,
        },
      });

      const recoveredQueue = { add: jest.fn().mockResolvedValue(undefined) };
      const reconciler = new IntegrationJobDispatchReconcilerService(
        repository as never,
        recoveredQueue as never,
      );
      await reconciler.sweep(new Date());
      expect(recoveredQueue.add).toHaveBeenCalledWith(
        IntegrationJobType.EDGE_EVENT,
        { integrationJobId: job.id },
        expect.objectContaining({ jobId: job.id }),
      );
    });
  },
);
