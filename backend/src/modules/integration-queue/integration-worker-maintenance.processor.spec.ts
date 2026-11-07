import { IntegrationWorkerMaintenanceProcessor } from './integration-worker-maintenance.processor';
import { integrationJobDispatchReconcileJobName } from './integration-worker-maintenance.job.constants';

describe('IntegrationWorkerMaintenanceProcessor dispatch reconciliation', () => {
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
    );

    await processor.process({ name: integrationJobDispatchReconcileJobName } as never);

    expect(dispatchReconciler.sweep).toHaveBeenCalledTimes(1);
    expect(heartbeat.writeHeartbeat).not.toHaveBeenCalled();
    expect(retention.sweep).not.toHaveBeenCalled();
  });
});
