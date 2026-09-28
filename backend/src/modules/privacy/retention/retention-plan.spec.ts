import { evaluateExecutionGate, nightlyRunKey, retentionCutoff, RetentionRefCollector } from './retention-plan';

const tz = 'Europe/Sarajevo';
const hour = 3_600_000;

describe('retention plan (paket 2.6 §7.3)', () => {
  it('computes the cutoff in whole days', () => {
    expect(retentionCutoff(new Date('2026-10-10T00:00:00Z'), 90).toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('runs inside the local night window only (DST-safe)', () => {
    // 02:30 Sarajevo in summer = 00:30 UTC.
    expect(nightlyRunKey(new Date('2026-07-01T00:29:00Z'), tz, '02:30')).toBeNull();
    expect(nightlyRunKey(new Date('2026-07-01T00:30:00Z'), tz, '02:30')).toBe('2026-07-01');
    expect(nightlyRunKey(new Date('2026-07-01T03:29:00Z'), tz, '02:30')).toBe('2026-07-01');
    expect(nightlyRunKey(new Date('2026-07-01T03:30:00Z'), tz, '02:30')).toBeNull();
    // Winter: 02:30 = 01:30 UTC.
    expect(nightlyRunKey(new Date('2026-12-01T01:00:00Z'), tz, '02:30')).toBeNull();
    expect(nightlyRunKey(new Date('2026-12-01T01:45:00Z'), tz, '02:30')).toBe('2026-12-01');
    expect(nightlyRunKey(new Date('2026-12-01T01:45:00Z'), tz, 'bad')).toBeNull();
  });

  const now = new Date('2026-10-10T02:00:00Z');
  const run = (over: Partial<{ category: string; mode: string; status: string; configDays: number | null; startedAt: Date }>) => ({
    category: 'attachments',
    mode: 'DRY_RUN',
    status: 'COMPLETED',
    configDays: 1095,
    startedAt: new Date(now.getTime() - 2 * hour),
    ...over,
  });

  it('technical categories need no dry run; disabled never runs', () => {
    expect(evaluateExecutionGate({ category: 'sessions', configDays: 90, now, history: [] })).toEqual({
      allowed: true,
      basis: 'not_required',
    });
    expect(evaluateExecutionGate({ category: 'sessions', configDays: 0, now, history: [] })).toEqual({
      allowed: false,
      reason: 'disabled',
    });
  });

  it('content categories need a fresh dry run with the same period', () => {
    const gate = (history: ReturnType<typeof run>[]) =>
      evaluateExecutionGate({ category: 'attachments', configDays: 1095, now, history });
    expect(gate([])).toEqual({ allowed: false, reason: 'dry_run_required' });
    expect(gate([run({})])).toEqual({ allowed: true, basis: 'dry_run' });
    expect(gate([run({ startedAt: new Date(now.getTime() - 25 * hour) })]).allowed).toBe(false);
    expect(gate([run({ configDays: 730 })]).allowed).toBe(false);
    expect(gate([run({ status: 'FAILED' })]).allowed).toBe(false);
    expect(gate([run({ category: 'audit' })]).allowed).toBe(false);
    expect(gate([run({ mode: 'EXECUTE', status: 'PARTIAL', startedAt: new Date('2026-01-01') })])).toEqual({
      allowed: true,
      basis: 'previous_execution',
    });
  });

  it('caps collected refs and marks truncation', () => {
    const collector = new RetentionRefCollector();
    collector.add(Array.from({ length: 5001 }, (_, index) => `T-${index}`));
    const result = collector.result();
    expect(result.refs).toHaveLength(5000);
    expect(result.truncated).toBe(true);
  });
});
