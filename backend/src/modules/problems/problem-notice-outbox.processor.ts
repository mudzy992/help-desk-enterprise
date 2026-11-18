import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import {
  TransactionalOutboxService,
  type OutboxDelivery,
} from '../../common/outbox/transactional-outbox.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxError, outboxErrorCodes } from '../../common/outbox/outbox.error';
import { ProblemNotifier } from './problem-notifier';
import {
  dispatchProblemNotice,
  parseProblemNoticeIntent,
  problemNoticeTopic,
} from './problem-notice-outbox';

const drainIntervalMs = 2_000;
const maxDispatchPerTick = 25;
/**
 * A dead-lettered notice is retried once per quarter of an hour, by the worker
 * itself, for the same reason the fan-out queue does it: an SMTP outage or a
 * restart of the mail relay is transient, and a notice worth sending should not
 * wait for an operator to notice the card.
 */
const deadLetterReplayCooldownMs = 15 * 60_000;
const deadLetterReplayBatchSize = 10;
const systemReplayActor = 'problem-notice-dispatcher';
const systemReplayReason = 'replayed automatically after the problem notice dead-letter cooldown';

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

export type ProblemNoticeOutboxHealth = Readonly<{
  pending: number;
  processing: number;
  deadLetter: number;
  oldestPendingAgeMs: number;
}>;

/**
 * W7.42 (BA-problems-21): the delivery side of problem notices, worker-only.
 *
 * Every two seconds the worker claims up to 25 rows of the
 * `problem.notice.dispatch` topic and hands them to the notifier. A row that
 * fails stays in the table with a lease-bounded claim, an exponential backoff
 * and an attempt counter; after `problemNoticeMaxAttempts` it ends as
 * `DEAD_LETTER` and stops retrying until an operator replays it through
 * `TransactionalOutboxService.replayDeadLetter`.
 *
 * The legacy `ProblemNotifier.run()` path is untouched for the one caller that
 * already has a durable row of its own: the target reminder
 * (`ProblemTargetReminderService`) records the attempt and its outcome itself.
 */
@Injectable()
export class ProblemNoticeOutboxProcessor implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ProblemNoticeOutboxProcessor.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private lastDeadLetterReplayAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TransactionalOutboxService,
    private readonly notifier: ProblemNotifier,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) => {
        this.logger.warn(`problem_notice_drain_failed reason=${errorText(error)}`);
      });
    }, drainIntervalMs);
    // The worker must not keep the process alive on its own.
    this.timer.unref?.();
    // Rows committed before the restart are not left waiting for the first tick.
    void this.drain().catch((error: unknown) => {
      this.logger.warn(`problem_notice_drain_failed reason=${errorText(error)}`);
    });
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One bounded pass; exported for the tests. */
  async drain(): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    let delivered = 0;
    try {
      for (let index = 0; index < maxDispatchPerTick; index += 1) {
        const outcome = await this.outbox.dispatchOne(problemNoticeTopic, (delivery) => this.deliver(delivery));
        if (outcome === 'succeeded') {
          delivered += 1;
          continue;
        }
        // `idle` means the queue is empty, `retry` that the next attempt is in
        // the future and `dead-letter` that the row is beyond help; all three
        // end the pass, and the next tick picks up whatever arrives meanwhile.
        break;
      }
      await this.replayEligibleDeadLetters(new Date());
    } finally {
      this.draining = false;
    }
    return delivered;
  }

  /**
   * Rows that burned every attempt are re-queued with a fresh attempt budget,
   * at most once per cooldown and only for rows that have not been replayed in
   * that window. The shared `replayDeadLetter` records who replayed a row and
   * why, so the manual and the automatic path are the same operation.
   */
  private async replayEligibleDeadLetters(now: Date): Promise<void> {
    if (now.getTime() - this.lastDeadLetterReplayAt < deadLetterReplayCooldownMs) return;
    this.lastDeadLetterReplayAt = now.getTime();
    const cutoff = new Date(now.getTime() - deadLetterReplayCooldownMs);
    const rows = await this.prisma.outboxMessage.findMany({
      where: {
        topic: problemNoticeTopic,
        status: 'DEAD_LETTER',
        OR: [{ lastReplayedAt: null, createdAt: { lte: cutoff } }, { lastReplayedAt: { lte: cutoff } }],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: deadLetterReplayBatchSize,
    });
    for (const row of rows) {
      try {
        await this.outbox.replayDeadLetter(row.id, { actor: systemReplayActor, reason: systemReplayReason });
        this.logger.warn(`problem_notice_dead_letter_replayed row=${row.id}`);
      } catch (error) {
        // Another worker replica replayed it first; that is the expected race.
        if (error instanceof OutboxError && error.code === outboxErrorCodes.replayConflict) continue;
        throw error;
      }
    }
  }

  private async deliver(delivery: OutboxDelivery): Promise<void> {
    const intent = parseProblemNoticeIntent(delivery.payload);
    try {
      await dispatchProblemNotice(this.notifier, intent);
    } catch (error) {
      // The notifier logs and swallows per-recipient failures; anything reaching
      // here is a failure of the notice itself, so the row is retried.
      this.logger.warn(
        `problem_notice_delivery_failed kind=${intent.kind} key=${delivery.dedupeKey} attempts=${delivery.attempts} reason=${errorText(error)}`,
      );
      throw error;
    }
  }

  /** Backlog of the topic, for the ops-health signal (W7.40 card). */
  async snapshot(now = new Date()): Promise<ProblemNoticeOutboxHealth> {
    const where = { topic: problemNoticeTopic };
    const [pending, processing, deadLetter, oldest] = await Promise.all([
      this.prisma.outboxMessage.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.outboxMessage.count({ where: { ...where, status: 'PROCESSING' } }),
      this.prisma.outboxMessage.count({ where: { ...where, status: 'DEAD_LETTER' } }),
      this.prisma.outboxMessage.findFirst({
        where: { ...where, status: { in: ['PENDING', 'PROCESSING'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      pending,
      processing,
      deadLetter,
      oldestPendingAgeMs: oldest === null ? 0 : Math.max(0, now.getTime() - oldest.createdAt.getTime()),
    };
  }
}
