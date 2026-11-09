import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { Prisma } from '../../generated/prisma/client';
import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { integrationJobDlqRetentionBatchSize, integrationJobProcessingLeaseDurationMilliseconds } from './integration-queue.constants';
import { IntegrationJobRepository } from './integration-job.repository';
import { IntegrationJobTerminalRetentionService } from './integration-job-terminal-retention.service';
import { integrationRetentionLegalHoldLockKey } from '../privacy/legal-hold/integration-retention-hold-lock';

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

    it('redacts terminal jobs after 30 days, waits another 90, and pauses globally on legal hold', async () => {
      const terminal = await createPendingJob('terminal-retention');
      const pending = await createPendingJob('terminal-pending');
      const now = new Date('2026-10-30T12:00:00Z');
      await prisma.integrationJob.update({ where: { id: terminal.id }, data: { status: IntegrationJobStatus.COMPLETED, updatedAt: new Date('2026-09-01T00:00:00Z'), payload: { text: 'private' } } });
      await prisma.integrationJob.update({ where: { id: pending.id }, data: { updatedAt: new Date('2026-01-01T00:00:00Z'), payload: { text: 'pending' } } });
      const heldUser = await prisma.user.create({ data: { email: `terminal-hold-${stamp}@example.test`, displayName: 'held', legalHoldAt: now } });
      try {
        const retention = new IntegrationJobTerminalRetentionService(prisma as never);
        await expect(retention.sweep(now)).resolves.toEqual({ held: true, redacted: 0, deleted: 0 });
        expect((await prisma.integrationJob.findUniqueOrThrow({ where: { id: terminal.id } })).payload).toEqual({ text: 'private' });
        await prisma.user.update({ where: { id: heldUser.id }, data: { legalHoldAt: null } });
        await expect(retention.sweep(now)).resolves.toEqual({ held: false, redacted: 1, deleted: 0 });
        await expect(prisma.integrationJob.findUniqueOrThrow({ where: { id: terminal.id } })).resolves.toMatchObject({ payload: { redacted: true }, lastError: 'INTEGRATION_JOB_PAYLOAD_REDACTED_V1', updatedAt: now });
        expect((await prisma.integrationJob.findUniqueOrThrow({ where: { id: pending.id } })).payload).toEqual({ text: 'pending' });
        await expect(retention.sweep(new Date('2027-01-28T12:00:00Z'))).resolves.toEqual({ held: false, redacted: 0, deleted: 0 });
        await expect(retention.sweep(new Date('2027-01-29T12:00:01Z'))).resolves.toEqual({ held: false, redacted: 0, deleted: 1 });
        expect(await prisma.integrationJob.findUnique({ where: { id: terminal.id } })).toBeNull();
      } finally {
        await prisma.user.delete({ where: { id: heldUser.id } });
      }
    });

    it('serializes retention behind an in-flight legal-hold transaction', async () => {
      const job = await createPendingJob('hold-lock');
      await prisma.integrationJob.update({ where: { id: job.id }, data: { status: IntegrationJobStatus.COMPLETED, updatedAt: new Date('2026-01-01'), payload: { secret: true } } });
      const user = await prisma.user.create({ data: { email: `hold-race-${stamp}@example.test`, displayName: 'hold race' } });
      let release!: () => void;
      let acquired!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const locked = new Promise<void>((resolve) => { acquired = resolve; });
      try {
        const hold = prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${integrationRetentionLegalHoldLockKey})`;
          await tx.user.update({ where: { id: user.id }, data: { legalHoldAt: new Date('2026-10-30') } });
          acquired();
          await gate;
        });
        await locked;
        const sweep = new IntegrationJobTerminalRetentionService(prisma as never).sweep(new Date('2026-10-30'));
        release();
        await hold;
        await expect(sweep).resolves.toEqual({ held: true, redacted: 0, deleted: 0 });
        expect((await prisma.integrationJob.findUniqueOrThrow({ where: { id: job.id } })).payload).toEqual({ secret: true });
      } finally {
        release();
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    it('observes the oldest dispatchable job without counting future retries or processing jobs', async () => {
      const future = await createPendingJob('backlog-future');
      const pending = await createPendingJob('backlog-pending');
      const processing = await createPendingJob('backlog-processing');
      const due = await createPendingJob('backlog-due');
      const now = new Date('2026-10-10T00:00:00.000Z');
      await prisma.integrationJob.update({ where: { id: future.id }, data: { status: IntegrationJobStatus.FAILED, createdAt: new Date('2020-01-01'), nextRetryAt: new Date('2027-01-01') } });
      await prisma.integrationJob.update({ where: { id: pending.id }, data: { createdAt: new Date('2023-01-01') } });
      await prisma.integrationJob.update({ where: { id: processing.id }, data: { status: IntegrationJobStatus.PROCESSING, createdAt: new Date('2019-01-01') } });
      await prisma.integrationJob.update({ where: { id: due.id }, data: { status: IntegrationJobStatus.FAILED, createdAt: new Date('2022-01-01'), nextRetryAt: new Date('2026-01-01') } });
      await expect(repository.findOldestDispatchable(now)).resolves.toEqual({ createdAt: new Date('2022-01-01') });
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
