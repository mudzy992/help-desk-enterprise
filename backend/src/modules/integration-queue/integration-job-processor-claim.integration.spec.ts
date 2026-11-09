import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { Prisma } from '../../generated/prisma/client';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { integrationJobDlqRetentionBatchSize, integrationJobProcessingLeaseDurationMilliseconds } from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

function claimInput(input: {
  readonly id: string;
  readonly attemptId: string;
  readonly ownerToken: string;
  readonly now: Date;
}) {
  return {
    ...input,
    leaseExpiresAt: new Date(
      input.now.getTime() + integrationJobProcessingLeaseDurationMilliseconds,
    ),
  };
}

describeIfDatabase(
  'integration-job processor claim fencing (PostgreSQL integration, BA-integration-queue-02)',
  () => {
    jest.setTimeout(120_000);
    let prisma: PrismaClient;
    let repository: IntegrationJobRepository;
    const jobIds: string[] = [];
    const stamp = Date.now();

    beforeAll(async () => {
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
      repository = new IntegrationJobRepository(prisma as never);
    });

    afterEach(async () => {
      if (jobIds.length > 0) {
        await prisma.integrationJob.deleteMany({
          where: { id: { in: [...jobIds] } },
        });
        jobIds.length = 0;
      }
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function createPendingJob(suffix: string) {
      const job = await prisma.integrationJob.create({
        data: {
          type: IntegrationJobType.EDGE_EVENT,
          payload: {
            userId: 'integration-test-user',
            eventName: `processor-claim-${stamp}-${suffix}`,
            data: { test: true },
          },
        },
      });
      jobIds.push(job.id);
      return job;
    }

    it('allows exactly one concurrent claimant for the same BullMQ attempt', async () => {
      const job = await createPendingJob('duplicate');
      const now = new Date();
      const firstInput = claimInput({
        id: job.id,
        attemptId: job.id,
        ownerToken: `owner-a-${stamp}`,
        now,
      });
      const secondInput = claimInput({
        id: job.id,
        attemptId: job.id,
        ownerToken: `owner-b-${stamp}`,
        now,
      });

      const claims = await Promise.all([
        repository.claimForProcessing(firstInput),
        repository.claimForProcessing(secondInput),
      ]);
      const winners = claims.filter((claim) => claim !== null);
      expect(winners).toHaveLength(1);
      const winner = winners[0]!;

      const stored = await prisma.integrationJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(stored).toMatchObject({
        status: IntegrationJobStatus.PROCESSING,
        attempts: 1,
        version: 1,
        processingAttemptId: job.id,
        processingOwnerToken: winner.processingOwnerToken,
        processingLeaseExpiresAt: winner.processingLeaseExpiresAt,
      });
      expect(winner.processingLeaseExpiresAt.getTime()).toBeGreaterThan(
        now.getTime(),
      );

      // Only the exact owner/version/attempt may commit a terminal transition.
      expect(await repository.markCompleted(winner)).toBe(true);
      expect(await repository.markFailed(winner, 'stale failure', new Date())).toBe(
        false,
      );
      await expect(
        prisma.integrationJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).resolves.toMatchObject({
        status: IntegrationJobStatus.COMPLETED,
        version: 2,
        processingAttemptId: null,
        processingOwnerToken: null,
        processingLeaseExpiresAt: null,
      });
    });

    it('fences an old attempt and its completion after the due retry is claimed', async () => {
      const job = await createPendingJob('retry');
      const firstNow = new Date();
      const firstClaim = await repository.claimForProcessing(
        claimInput({
          id: job.id,
          attemptId: job.id,
          ownerToken: `owner-first-${stamp}`,
          now: firstNow,
        }),
      );
      expect(firstClaim).not.toBeNull();
      if (firstClaim === null) throw new Error('initial processor claim failed');

      const dueAt = new Date(Date.now() - 1_000);
      expect(
        await repository.markFailed(firstClaim, 'transient test failure', dueAt),
      ).toBe(true);

      const retryNow = new Date();
      await expect(
        repository.claimForProcessing(
          claimInput({
            id: job.id,
            attemptId: job.id,
            ownerToken: `owner-stale-${stamp}`,
            now: retryNow,
          }),
        ),
      ).resolves.toBeNull();

      const retryClaim = await repository.claimForProcessing(
        claimInput({
          id: job.id,
          attemptId: `${job.id}:1`,
          ownerToken: `owner-retry-${stamp}`,
          now: retryNow,
        }),
      );
      expect(retryClaim).not.toBeNull();
      if (retryClaim === null) throw new Error('due retry claim failed');

      expect(await repository.markCompleted(firstClaim)).toBe(false);
      expect(
        await repository.markCompleted({
          ...retryClaim,
          processingOwnerToken: `wrong-owner-${stamp}`,
        }),
      ).toBe(false);
      expect(await repository.markCompleted(retryClaim)).toBe(true);

      await expect(
        prisma.integrationJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).resolves.toMatchObject({
        status: IntegrationJobStatus.COMPLETED,
        attempts: 2,
        version: 4,
      });
    });

    it('quarantines an expired claim once and fences the original worker', async () => {
      const job = await createPendingJob('quarantine');
      const now = new Date();
      const claim = await repository.claimForProcessing(claimInput({
        id: job.id, attemptId: job.id, ownerToken: `quarantine-${stamp}`,
        now: new Date(now.getTime() - integrationJobProcessingLeaseDurationMilliseconds - 1000),
      }));
      if (claim === null) throw new Error('claim failed');
      const snapshot = await prisma.integrationJob.findUniqueOrThrow({ where: { id: job.id } });
      const results = await Promise.all([
        repository.quarantineExpiredProcessing(snapshot, now),
        repository.quarantineExpiredProcessing(snapshot, now),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await repository.markCompleted(claim)).toBe(false);
      expect(await repository.resetForAdminRetry(job.id, 'admin-test')).toBeNull();
      await expect(prisma.integrationJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({
        status: IntegrationJobStatus.DLQ,
        lastError: 'PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN',
        processingOwnerToken: null,
      });
    });

    it('bounds DLQ retention and preserves both unknown-outcome quarantines', async () => {
      const before = new Date('2000-01-01T00:00:00Z');
      const old = new Date('1999-01-01T00:00:00Z');
      const ids = Array.from({ length: integrationJobDlqRetentionBatchSize + 5 }, (_, i) => `retention-${stamp}-${String(i).padStart(4, '0')}`);
      const protectedIds = [`quarantine-lease-${stamp}`, `quarantine-provider-${stamp}`];
      jobIds.push(...ids, ...protectedIds);
      await prisma.integrationJob.createMany({ data: [
        ...ids.map((id) => ({ id, type: IntegrationJobType.TEAMS, status: IntegrationJobStatus.DLQ, payload: {}, updatedAt: old })),
        ...protectedIds.map((id, i) => ({ id, type: IntegrationJobType.TEAMS, status: IntegrationJobStatus.DLQ, payload: {}, updatedAt: old, lastError: i === 0 ? 'PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN' : 'PROVIDER_DELIVERY_OUTCOME_UNKNOWN' })),
      ] });
      expect((await repository.deleteDeadLetterOlderThan(before)).count).toBe(integrationJobDlqRetentionBatchSize);
      expect(await prisma.integrationJob.count({ where: { id: { in: ids } } })).toBe(5);
      expect((await repository.deleteDeadLetterOlderThan(before)).count).toBe(5);
      expect(await prisma.integrationJob.count({ where: { id: { in: protectedIds } } })).toBe(2);
    });

    it('does not delete a candidate changed after retention selection', async () => {
      const job = await createPendingJob('retention-race');
      const before = new Date('2000-01-01T00:00:00Z');
      await prisma.integrationJob.update({ where: { id: job.id }, data: { status: IntegrationJobStatus.DLQ, updatedAt: new Date('1999-01-01T00:00:00Z') } });
      const integrationJob = {
        findMany: async (args: Prisma.IntegrationJobFindManyArgs) => {
          const rows = await prisma.integrationJob.findMany(args);
          await prisma.integrationJob.update({ where: { id: job.id }, data: { status: IntegrationJobStatus.PENDING, version: { increment: 1 } } });
          return rows;
        },
        deleteMany: prisma.integrationJob.deleteMany.bind(prisma.integrationJob),
      };
      const racingRepository = new IntegrationJobRepository({ integrationJob } as never);
      expect((await racingRepository.deleteDeadLetterOlderThan(before)).count).toBe(0);
      await expect(prisma.integrationJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: IntegrationJobStatus.PENDING, version: 1 });
    });

    it('does not directly reclaim an expired PROCESSING lease', async () => {
      const job = await createPendingJob('expired');
      const now = new Date();
      const expiredAt = new Date(now.getTime() - 1_000);
      await prisma.integrationJob.update({
        where: { id: job.id },
        data: {
          status: IntegrationJobStatus.PROCESSING,
          attempts: 1,
          version: 1,
          processingAttemptId: job.id,
          processingOwnerToken: `abandoned-owner-${stamp}`,
          processingLeaseExpiresAt: expiredAt,
        },
      });

      await expect(
        repository.claimForProcessing(
          claimInput({
            id: job.id,
            attemptId: job.id,
            ownerToken: `owner-after-expiry-${stamp}`,
            now,
          }),
        ),
      ).resolves.toBeNull();
      await expect(
        prisma.integrationJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).resolves.toMatchObject({
        status: IntegrationJobStatus.PROCESSING,
        processingOwnerToken: `abandoned-owner-${stamp}`,
        processingLeaseExpiresAt: expiredAt,
      });
    });
  },
);
