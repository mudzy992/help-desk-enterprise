import {
  knowledgeBaseReviewReminderJobName,
  knowledgeBaseReviewReminderSchedulePattern,
  knowledgeBaseReviewReminderSchedulerId,
} from './modules/knowledge-base/knowledge-base-review-reminder.job.constants';
import { KnowledgeBaseReviewReminderSchedulerService } from './modules/knowledge-base/knowledge-base-review-reminder.scheduler.service';
import {
  integrationDlqRetentionSchedulerId,
  integrationWorkerHeartbeatRepeatEveryMilliseconds,
  integrationWorkerHeartbeatSchedulerId,
} from './modules/integration-queue/integration-worker-maintenance.job.constants';
import { IntegrationWorkerMaintenanceSchedulerService } from './modules/integration-queue/integration-worker-maintenance.scheduler.service';
import {
  ticketArchiveJobName,
  ticketArchiveSchedulePattern,
  ticketArchiveSchedulerId,
} from './modules/tickets/archive/ticket-archive.job.constants';
import { TicketArchiveSchedulerService } from './modules/tickets/archive/ticket-archive.scheduler.service';
import {
  waitingForUserJobName,
  waitingForUserSchedulePattern,
  waitingForUserSchedulerId,
} from './modules/tickets/waiting-for-user/waiting-for-user.job.constants';
import {
  unroutedSweepSchedulePattern,
  unroutedSweepSchedulerId,
} from './modules/tickets/unrouted/unrouted-sweep.job.constants';
import { UnroutedSweepSchedulerService } from './modules/tickets/unrouted/unrouted-sweep.scheduler.service';
import { WaitingForUserSchedulerService } from './modules/tickets/waiting-for-user/waiting-for-user.scheduler.service';

// The maintenance scheduler pulls in SettingsService, which imports the Prisma
// client; the same shim the worker/app module specs use keeps this a pure unit test.
jest.mock('./common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Phase 4.1 (plan §4.1): two invariants a pure unit test can still pin down without
 * Redis —
 *
 * 1. Starting a second worker adds no second schedule: every registration is an
 *    upsert by a stable scheduler id, so the store converges on one entry per job
 *    (the queue then owns the "exactly one worker runs it" lock).
 * 2. The three 15-minute sweeps are staggered inside the window, so the archive, the
 *    waiting-for-user and the knowledge-base sweep never start together.
 */
describe('periodic job wiring', () => {
  function createSchedulerStore() {
    const entries = new Map<string, unknown>();
    const queue = {
      upsertJobScheduler: jest.fn(
        async (schedulerId: string, _repeat: unknown, template: unknown) => {
          entries.set(schedulerId, template);
          return {};
        },
      ),
    };
    return { entries, queue };
  }

  function registerAll(queue: unknown) {
    return [
      new TicketArchiveSchedulerService(queue as never),
      new WaitingForUserSchedulerService(queue as never),
      new KnowledgeBaseReviewReminderSchedulerService(queue as never),
      new UnroutedSweepSchedulerService(queue as never),
      new IntegrationWorkerMaintenanceSchedulerService(queue as never, {
        load: () => {
          throw new Error('settings unavailable');
        },
      } as never),
    ];
  }

  it('registers one schedule per job even when two workers start', async () => {
    const store = createSchedulerStore();

    for (const scheduler of [...registerAll(store.queue), ...registerAll(store.queue)]) {
      await scheduler.onModuleInit();
    }

    expect([...store.entries.keys()].sort()).toEqual(
      [
        ticketArchiveSchedulerId,
        waitingForUserSchedulerId,
        knowledgeBaseReviewReminderSchedulerId,
        unroutedSweepSchedulerId,
        integrationWorkerHeartbeatSchedulerId,
        integrationDlqRetentionSchedulerId,
      ].sort(),
    );
    expect(store.queue.upsertJobScheduler).toHaveBeenCalledTimes(12);
    // The twelve registrations describe six schedules, so no job can run twice.
    expect(store.entries.size).toBe(6);
  });

  it('staggers the four sweeps inside the fifteen-minute window', () => {
    const minuteFields = [
      ticketArchiveSchedulePattern,
      waitingForUserSchedulePattern,
      knowledgeBaseReviewReminderSchedulePattern,
      unroutedSweepSchedulePattern,
    ].map((pattern) => pattern.split(' ')[1]);

    const minuteSets = minuteFields.map(
      (field) => new Set(field.split(',').map((minute) => Number(minute))),
    );
    for (const minutes of minuteSets) {
      expect(minutes.size).toBe(4);
    }
    expect(new Set(minuteFields).size).toBe(4);
    for (const left of minuteSets) {
      for (const right of minuteSets) {
        if (left === right) {
          continue;
        }
        for (const minute of left) {
          expect(right.has(minute)).toBe(false);
        }
      }
    }
    // The heartbeat keeps its fast cadence; only the sweeps are staggered.
    expect(integrationWorkerHeartbeatRepeatEveryMilliseconds).toBe(10_000);
    expect(new Set([ticketArchiveJobName, waitingForUserJobName]).size).toBe(2);
  });
});
