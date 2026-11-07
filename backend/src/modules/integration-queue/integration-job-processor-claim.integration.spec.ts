import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { integrationJobProcessingLeaseDurationMilliseconds } from './integration-queue.constants';
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

    it('does not reclaim even an expired PROCESSING lease (BA-05 remains separate)', async () => {
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
