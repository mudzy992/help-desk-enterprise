import { IntegrationWorkerMaintenanceProcessor } from './integration-worker-maintenance.processor';
import { integrationDlqRetentionJobName, integrationJobDispatchReconcileJobName } from './integration-worker-maintenance.job.constants';

describe('IntegrationWorkerMaintenanceProcessor dispatch reconciliation', () => {
  it('runs terminal retention alongside the existing separate DLQ sweep', async () => {
    const dlq = { sweep: jest.fn().mockResolvedValue(2) };
    const terminal = { sweep: jest.fn().mockResolvedValue({ held: false, redacted: 3, deleted: 1 }) };
    const processor = new IntegrationWorkerMaintenanceProcessor({} as never, dlq as never, {} as never, terminal as never);
    const original = process.env.INTEGRATION_TERMINAL_RETENTION_ENABLED;
    try {
      delete process.env.INTEGRATION_TERMINAL_RETENTION_ENABLED;
      await processor.process({ name: integrationDlqRetentionJobName } as never);
      expect(dlq.sweep).toHaveBeenCalledTimes(1);
      expect(terminal.sweep).not.toHaveBeenCalled();
      process.env.INTEGRATION_TERMINAL_RETENTION_ENABLED = 'true';
      await processor.process({ name: integrationDlqRetentionJobName } as never);
      expect(dlq.sweep).toHaveBeenCalledTimes(2);
      expect(terminal.sweep).toHaveBeenCalledTimes(1);
    } finally {
      if (original === undefined) delete process.env.INTEGRATION_TERMINAL_RETENTION_ENABLED;
      else process.env.INTEGRATION_TERMINAL_RETENTION_ENABLED = original;
    }
  });
  it('runs the durable dispatcher for its scheduled job', async () => {
    const heartbeat = { writeHeartbeat: jest.fn().mockResolvedValue(undefined) };
    const retention = { sweep: jest.fn().mockResolvedValue(0) };
    const dispatchReconciler = {
      sweep: jest.fn().mockResolvedValue({ processed: 7, failed: 1 }),
    };
    const processor = new IntegrationWorkerMaintenanceProcessor(
      heartbeat as never,
      retention as never,
      dispatchReconciler as never,
      { sweep: jest.fn() } as never,
    );

    await processor.process({ name: integrationJobDispatchReconcileJobName } as never);

    expect(dispatchReconciler.sweep).toHaveBeenCalledTimes(1);
    expect(heartbeat.writeHeartbeat).not.toHaveBeenCalled();
    expect(retention.sweep).not.toHaveBeenCalled();
  });
});
