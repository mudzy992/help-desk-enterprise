import { formatJobMetrics } from './format-job-metrics';

describe('formatJobMetrics', () => {
  it('writes the Phase 0 key=value shape', () => {
    expect(
      formatJobMetrics({
        job: 'ticket-archive-scan',
        durationMs: 42,
        processed: 3,
        failed: 0,
      }),
    ).toBe(
      'job=ticket-archive-scan job_duration_ms=42 job_processed=3 job_failed=0',
    );
  });
});
