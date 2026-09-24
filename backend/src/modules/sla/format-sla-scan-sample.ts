/**
 * Phase 2.1 (plan §2.1, metric 6): one greppable line per scan cycle, in the
 * same shape as the Phase 0 lines (`event_loop_lag_p95_ms=…`,
 * `db_queries_per_request=…`) so the same log pipeline can chart it.
 */
export type SlaScanSample = {
  /** Wall time of the whole cycle, including the database writes. */
  readonly durationMs: number;
  /** States the cycle actually processed. */
  readonly processed: number;
  /** Upper bound the cycle was allowed to process. */
  readonly batchLimit: number;
  /** States that were due but did not fit in this cycle. */
  readonly remaining: number;
};

export const slaScanLogContext = 'SlaScan';

export function formatSlaScanSample(sample: SlaScanSample): string {
  return (
    `sla_scan_duration_ms=${sample.durationMs}` +
    ` sla_scan_processed=${sample.processed}` +
    ` sla_scan_batch_limit=${sample.batchLimit}` +
    ` sla_scan_remaining=${sample.remaining}`
  );
}
