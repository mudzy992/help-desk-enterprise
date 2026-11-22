import type { KnowledgeReviewReminderRun } from './knowledge-base-review-reminder.service';
import {
  KnowledgeBaseReviewReminderProcessor,
  knowledgeViewFlushLagWarnDays,
} from './knowledge-base-review-reminder.processor';

/**
 * W7.86 (`BA-knowledge-base-13`): the review reminder and the view flush share one
 * job. The flush used to run only after a successful sweep, so a reminder failure
 * silently starved the counters whose Redis keys expire after eight days — one bug
 * became permanent data loss. These cases pin the independence, the health line and
 * the lag warning.
 */
describe('KnowledgeBaseReviewReminderProcessor', () => {
  function createRun(overrides: Partial<KnowledgeReviewReminderRun> = {}): KnowledgeReviewReminderRun {
    return {
      sent: 4,
      candidates: 3,
      batches: 1,
      noRecipientArticles: 1,
      unresolvedScopeArticles: 0,
      reminderBlockedRecipients: 2,
      capped: false,
      ...overrides,
    };
  }

  function createProcessor(options: {
    readonly sweep?: () => Promise<KnowledgeReviewReminderRun>;
    readonly flush?: () => Promise<number>;
    readonly backlog?: () => Promise<{ pendingFinishedDays: number; oldestFinishedDay: string | null; lagDays: number | null }>;
  }) {
    const automation = { processDueWithSummary: jest.fn(options.sweep ?? (async () => createRun())) };
    const viewFlush = {
      flush: jest.fn(options.flush ?? (async () => 7)),
      backlog: jest.fn(
        options.backlog ??
          (async () => ({ pendingFinishedDays: 0, oldestFinishedDay: null, lagDays: null })),
      ),
    };
    const processor = new KnowledgeBaseReviewReminderProcessor(
      automation as never,
      viewFlush as never,
    );
    const logs: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const logger = (processor as unknown as {
      logger: {
        log: (message: string) => void;
        warn: (message: string) => void;
        error: (message: string) => void;
      };
    }).logger;
    jest.spyOn(logger, 'log').mockImplementation((message: string) => {
      logs.push(message);
    });
    jest.spyOn(logger, 'warn').mockImplementation((message: string) => {
      warnings.push(message);
    });
    jest.spyOn(logger, 'error').mockImplementation((message: string) => {
      errors.push(message);
    });
    return { processor, automation, viewFlush, logs, warnings, errors };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the sweep and flush numbers of a healthy run', async () => {
    const { processor, logs } = createProcessor({});

    await processor.process();

    const health = logs.find((line) => line.includes('kb_due_candidates='));
    expect(health).toBe(
      [
        'job=knowledge-base-review-reminder-scan',
        'kb_due_candidates=3',
        'kb_batches=1',
        'kb_reminders_sent=4',
        'kb_no_recipient_articles=1',
        'kb_unresolved_scope_articles=0',
        'kb_blocked_recipients=2',
        'kb_capped=0',
        'kb_views_flushed=7',
        'kb_views_pending_days=0',
        'kb_views_lag_days=0',
      ].join(' '),
    );
    // The generic job line stays (Phase 4.1 contract); the health line is additive.
    expect(logs[0]).toMatch(
      /^job=knowledge-base-review-reminder-scan job_duration_ms=\d+ job_processed=4 job_failed=0$/,
    );
  });

  it('still flushes the view counters when the reminder sweep throws, and fails the job for it', async () => {
    const { processor, viewFlush, logs, errors } = createProcessor({
      sweep: async () => {
        throw new Error('article query failed');
      },
    });

    await expect(processor.process()).rejects.toThrow('article query failed');

    expect(viewFlush.flush).toHaveBeenCalledTimes(1);
    expect(logs.some((line) => line.includes('kb_views_flushed=7'))).toBe(true);
    expect(errors[0]).toContain('knowledge review reminder sweep failed: article query failed');
  });

  it('keeps the job green when only the flush fails', async () => {
    const { processor, logs, warnings } = createProcessor({
      flush: async () => {
        throw new Error('redis hiccup');
      },
    });

    await expect(processor.process()).resolves.toBeUndefined();

    expect(logs.some((line) => line.includes('kb_views_flushed=0'))).toBe(true);
    expect(warnings[0]).toContain('knowledge view flush failed: redis hiccup');
  });

  it('warns when finished view days stack up toward the eight-day TTL', async () => {
    const { processor, warnings } = createProcessor({
      backlog:
        async () => ({ pendingFinishedDays: 3, oldestFinishedDay: '2026-11-18', lagDays: knowledgeViewFlushLagWarnDays }),
    });

    await processor.process();

    expect(warnings).toEqual([
      expect.stringContaining(
        `knowledge view counters are ${knowledgeViewFlushLagWarnDays} day(s) behind (oldest day 2026-11-18, 3 pending day(s))`,
      ),
    ]);
  });

  it('does not warn about a single unfinished day', async () => {
    const { processor, warnings } = createProcessor({
      backlog: async () => ({ pendingFinishedDays: 1, oldestFinishedDay: '2026-11-21', lagDays: 1 }),
    });

    await processor.process();

    expect(warnings).toEqual([]);
  });

  it('names the batch ceiling when one pass could not drain the backlog', async () => {
    const { processor, warnings } = createProcessor({
      sweep: async () => createRun({ capped: true, candidates: 2000, batches: 20 }),
    });

    await processor.process();

    expect(warnings).toEqual([
      'knowledge review reminder backlog exceeded one pass: candidates=2000 batches=20',
    ]);
  });

  it('tolerates a worker without a flush service', async () => {
    const automation = { processDueWithSummary: jest.fn(async () => createRun()) };
    const processor = new KnowledgeBaseReviewReminderProcessor(automation as never);

    await expect(processor.process()).resolves.toBeUndefined();
  });
});
