import type { Job } from 'bullmq';
import {
  reportSchedulesManualJobName,
  reportSchedulesRetentionJobName,
  reportSchedulesSweepJobName,
} from './report-schedule.constants';
import { ReportSchedulesProcessor } from './report-schedules.processor';

/**
 * W7.103 (`BA-reports-14`): retention used to run only inside the delivery sweep, and only after the sweep decided
 * delivery was enabled. It is now its own job on the same queue: the processor routes it to the retention pass and
 * lets a failure propagate, so BullMQ retries it and the queue reports the failure.
 */
describe('ReportSchedulesProcessor', () => {
  function createRunner() {
    return {
      runDue: jest.fn(async () => ({ processed: 0 })),
      runManual: jest.fn(async () => ({ status: 'SENT' })),
      pruneExpiredRuns: jest.fn(async () => ({
        deleted: 0,
        cutoff: new Date(),
        batches: 0,
        remaining: false,
      })),
    };
  }

  function job(name: string, data: Record<string, unknown> = {}): Job<Record<string, unknown>> {
    return { name, data } as Job<Record<string, unknown>>;
  }

  it('runs the retention pass for its own job and never builds a report', async () => {
    const runner = createRunner();
    const processor = new ReportSchedulesProcessor(runner as never);

    await processor.process(job(reportSchedulesRetentionJobName));

    expect(runner.pruneExpiredRuns).toHaveBeenCalledTimes(1);
    expect(runner.runDue).not.toHaveBeenCalled();
    expect(runner.runManual).not.toHaveBeenCalled();
  });

  it('lets a retention failure reach BullMQ (no silent swallow)', async () => {
    const runner = createRunner();
    runner.pruneExpiredRuns.mockRejectedValueOnce(new Error('deadlock detected'));
    const processor = new ReportSchedulesProcessor(runner as never);

    await expect(processor.process(job(reportSchedulesRetentionJobName))).rejects.toThrow(
      'deadlock detected',
    );
  });

  it('runs the due sweep for the sweep job', async () => {
    const runner = createRunner();
    const processor = new ReportSchedulesProcessor(runner as never);

    await processor.process(job(reportSchedulesSweepJobName));

    expect(runner.runDue).toHaveBeenCalledTimes(1);
    expect(runner.pruneExpiredRuns).not.toHaveBeenCalled();
  });

  it('runs a manual report and ignores a job without a schedule id', async () => {
    const runner = createRunner();
    const processor = new ReportSchedulesProcessor(runner as never);

    await processor.process(job(reportSchedulesManualJobName, { scheduleId: 'sch-1', actorUserId: 'u-1' }));
    await processor.process(job(reportSchedulesManualJobName));

    expect(runner.runManual).toHaveBeenCalledTimes(1);
    expect(runner.runManual).toHaveBeenCalledWith({
      scheduleId: 'sch-1',
      actorUserId: 'u-1',
      commandKey: undefined,
    });
  });

  // W7.106 (BA-reports-16): the command key must reach the runner, otherwise the unique run insert cannot dedupe.
  it('passes the command key of a „send now” job to the runner', async () => {
    const runner = createRunner();
    const processor = new ReportSchedulesProcessor(runner as never);

    await processor.process(
      job(reportSchedulesManualJobName, {
        scheduleId: 'sch-1',
        actorUserId: 'u-1',
        commandKey: 'command-12345678',
      }),
    );

    expect(runner.runManual).toHaveBeenCalledWith({
      scheduleId: 'sch-1',
      actorUserId: 'u-1',
      commandKey: 'command-12345678',
    });
  });
});
