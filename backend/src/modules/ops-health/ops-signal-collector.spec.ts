import { expectedAssetSchedulers, expectedProblemSchedulers } from './ops-health.constants';
import { includeExpectedSchedulers } from './ops-signal-collector';

describe('expected scheduler health rows', () => {
  const expected = expectedAssetSchedulers[0];

  it('annotates the registered scheduler with its last-success age gate', () => {
    const lastSuccessMs = Date.parse('2026-10-30T09:00:00.000Z');
    const result = includeExpectedSchedulers(
      [
        {
          queue: expected.queue,
          schedulerId: expected.schedulerId,
          everyMs: null,
          pattern: expected.pattern,
          nextMs: lastSuccessMs + 60 * 60_000,
          lastSuccessMs,
          lastFailureMs: null,
        },
      ],
      [{ queue: expected.queue, lastSuccessMs, lastFailureMs: null }],
    );

    expect(result).toEqual([
      expect.objectContaining({
        queue: expected.queue,
        schedulerId: expected.schedulerId,
        registered: true,
        lastSuccessMs,
        lastSuccessMaxAgeMs: expected.lastSuccessMaxAgeMs,
      }),
    ]);
  });

  it('keeps a missing registration visible and retains the queue last-success timestamp', () => {
    const lastSuccessMs = Date.parse('2026-10-30T08:00:00.000Z');
    const result = includeExpectedSchedulers([], [
      { queue: expected.queue, lastSuccessMs, lastFailureMs: null },
    ]);

    expect(result).toEqual([
      {
        queue: expected.queue,
        schedulerId: expected.schedulerId,
        everyMs: null,
        pattern: expected.pattern,
        nextMs: null,
        lastSuccessMs,
        lastFailureMs: null,
        registered: false,
        lastSuccessMaxAgeMs: expected.lastSuccessMaxAgeMs,
      },
    ]);
  });

  it('does not declare a scheduler missing when its queue inspection timed out', () => {
    expect(includeExpectedSchedulers([], [])).toEqual([]);
  });

  // W7.32 (BA-problems-14): a flushed Redis deletes the hourly problem sweep too.
  // Without a synthesized row the card and the alarm would stay quiet while the
  // reminders and the auto-close stopped.
  it('reports the hourly problem sweep as missing after a Redis flush', () => {
    const problem = expectedProblemSchedulers[0];
    const lastSuccessMs = Date.parse('2026-10-29T08:23:00.000Z');
    const result = includeExpectedSchedulers(
      [],
      [{ queue: problem.queue, lastSuccessMs, lastFailureMs: null }],
    );

    expect(result).toEqual([
      {
        queue: 'problem-sweep',
        schedulerId: 'problem-sweep-hourly',
        everyMs: null,
        pattern: '23 * * * *',
        nextMs: null,
        lastSuccessMs,
        lastFailureMs: null,
        registered: false,
        lastSuccessMaxAgeMs: 75 * 60_000,
      },
    ]);
  });

  it('leaves the problem sweep alone while its registration is still there', () => {
    const problem = expectedProblemSchedulers[0];
    const lastSuccessMs = Date.parse('2026-10-29T08:23:00.000Z');
    const result = includeExpectedSchedulers(
      [
        {
          queue: problem.queue,
          schedulerId: problem.schedulerId,
          everyMs: null,
          pattern: problem.pattern,
          nextMs: lastSuccessMs + 60 * 60_000,
          lastSuccessMs,
          lastFailureMs: null,
        },
      ],
      [{ queue: problem.queue, lastSuccessMs, lastFailureMs: null }],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      registered: true,
      lastSuccessMaxAgeMs: problem.lastSuccessMaxAgeMs,
    });
  });
});
