import { Logger, Optional } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { formatJobMetrics } from '../../common/scheduled-jobs/format-job-metrics';
import {
  KnowledgeBaseReviewReminderService,
  type KnowledgeReviewReminderRun,
} from './knowledge-base-review-reminder.service';
import type { KnowledgeViewBacklog } from './portal/knowledge-article-views';
import { KnowledgeViewFlushService } from './portal/knowledge-view-flush.service';
import {
  knowledgeBaseReviewReminderJobLogContext,
  knowledgeBaseReviewReminderJobName,
  knowledgeBaseReviewReminderJobTimeoutMilliseconds,
  knowledgeBaseReviewReminderQueueName,
} from './knowledge-base-review-reminder.job.constants';

/** A sweep either produced its summary or failed; the two are reported together. */
type KnowledgeReviewSweepOutcome =
  | { readonly run: KnowledgeReviewReminderRun; readonly error: null }
  | { readonly run: null; readonly error: unknown };

/**
 * A finished UTC day still in Redis after this many flush windows means the counter
 * flush did not run for at least two days. The keys expire after eight, so this is
 * the early warning — not the loss itself.
 */
export const knowledgeViewFlushLagWarnDays = 2;

/**
 * Phase 4.1 (plan §4.1): the sweep runs here — in the worker process — so the API
 * log carries no job iterations at all. The business logic is untouched; this is
 * only the frame around `processDue()`.
 */
@Processor(knowledgeBaseReviewReminderQueueName, {
  // Phase 4.1: one run at a time — a slow sweep delays the next tick instead of
  // overlapping it, and the queue lock keeps a second worker off the same run.
  concurrency: 1,
  lockDuration: knowledgeBaseReviewReminderJobTimeoutMilliseconds,
})
export class KnowledgeBaseReviewReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(knowledgeBaseReviewReminderJobLogContext);

  constructor(
    private readonly automation: KnowledgeBaseReviewReminderService,
    @Optional() private readonly viewFlush?: KnowledgeViewFlushService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    // W7.86 (`BA-knowledge-base-13`): the flush used to run *after* the reminder
    // sweep and only if it succeeded. One failing reminder query therefore starved
    // the counters until someone fixed the reminder — while the Redis keys that hold
    // those counters expire after eight days, so a reminder bug could destroy view
    // analytics. The two halves of this job now fail independently.
    const sweep = await this.runSweep();
    const flush = await this.runViewFlush();

    const processed = sweep.run?.sent ?? 0;
    const failed = sweep.error === null ? 0 : 1;
    this.logger.log(
      formatJobMetrics({
        job: knowledgeBaseReviewReminderJobName,
        durationMs: Date.now() - startedAt,
        processed,
        failed,
      }),
    );
    this.logger.log(
      [
        `job=${knowledgeBaseReviewReminderJobName}`,
        `kb_due_candidates=${sweep.run?.candidates ?? 0}`,
        `kb_batches=${sweep.run?.batches ?? 0}`,
        `kb_reminders_sent=${processed}`,
        `kb_no_recipient_articles=${sweep.run?.noRecipientArticles ?? 0}`,
        `kb_unresolved_scope_articles=${sweep.run?.unresolvedScopeArticles ?? 0}`,
        `kb_blocked_recipients=${sweep.run?.reminderBlockedRecipients ?? 0}`,
        `kb_capped=${sweep.run?.capped === true ? 1 : 0}`,
        `kb_views_flushed=${flush.written}`,
        `kb_views_pending_days=${flush.backlog?.pendingFinishedDays ?? 0}`,
        `kb_views_lag_days=${flush.backlog?.lagDays ?? 0}`,
      ].join(' '),
    );
    if (sweep.run?.capped === true) {
      this.logger.warn(
        `knowledge review reminder backlog exceeded one pass: candidates=${sweep.run.candidates} batches=${sweep.run.batches}`,
      );
    }
    if (flush.backlog !== null && flush.backlog.lagDays !== null) {
      this.warnOnFlushLag(flush.backlog);
    }

    if (sweep.error !== null) {
      this.logger.error(
        `knowledge review reminder sweep failed: ${
          sweep.error instanceof Error ? sweep.error.message : String(sweep.error)
        }`,
      );
      throw sweep.error;
    }
  }

  private async runSweep(): Promise<KnowledgeReviewSweepOutcome> {
    try {
      return { run: await this.automation.processDueWithSummary(), error: null };
    } catch (error) {
      return { run: null, error };
    }
  }

  private async runViewFlush(): Promise<{
    readonly written: number;
    readonly backlog: KnowledgeViewBacklog | null;
  }> {
    // Paket 2.9 (K1b): a failing flush must not fail the reminders; the counters
    // stay in Redis (8-day TTL) and the next run retries.
    let written = 0;
    try {
      written = (await this.viewFlush?.flush()) ?? 0;
    } catch (error) {
      this.logger.warn(
        `knowledge view flush failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let backlog: KnowledgeViewBacklog | null = null;
    try {
      backlog = (await this.viewFlush?.backlog()) ?? null;
    } catch (error) {
      this.logger.warn(
        `knowledge view backlog unreadable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { written, backlog };
  }

  private warnOnFlushLag(backlog: KnowledgeViewBacklog): void {
    if (backlog.lagDays === null || backlog.lagDays < knowledgeViewFlushLagWarnDays) return;
    this.logger.warn(
      `knowledge view counters are ${backlog.lagDays} day(s) behind (oldest day ${backlog.oldestFinishedDay}, ${backlog.pendingFinishedDays} pending day(s)) — the keys expire after 8 days`,
    );
  }
}
