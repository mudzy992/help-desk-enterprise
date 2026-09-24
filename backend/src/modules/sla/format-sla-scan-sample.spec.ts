import { formatSlaScanSample } from './format-sla-scan-sample';

describe('formatSlaScanSample', () => {
  it('emits one line with the plan metric names', () => {
    expect(
      formatSlaScanSample({
        durationMs: 1234,
        processed: 42,
        batchLimit: 2000,
        remaining: 0,
      }),
    ).toBe(
      'sla_scan_duration_ms=1234 sla_scan_processed=42 sla_scan_batch_limit=2000 sla_scan_remaining=0',
    );
  });
});
