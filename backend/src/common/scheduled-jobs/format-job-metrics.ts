/**
 * Phase 4.1 (plan §4.1, item 2): one log line per finished scheduled job, in the
 * same `key=value` shape Phase 0 introduced (`ws_clients_count`, `sla_scan_…`).
 */
export type ScheduledJobMetrics = {
  readonly job: string;
  readonly durationMs: number;
  readonly processed: number;
  readonly failed: number;
};

export function formatJobMetrics(metrics: ScheduledJobMetrics): string {
  return [
    `job=${metrics.job}`,
    `job_duration_ms=${metrics.durationMs}`,
    `job_processed=${metrics.processed}`,
    `job_failed=${metrics.failed}`,
  ].join(' ');
}
