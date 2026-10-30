import { expectedAssetSchedulers } from './ops-health.constants';
import { includeExpectedAssetSchedulers } from './ops-signal-collector';

describe('expected assets scheduler health rows', () => {
  const expected = expectedAssetSchedulers[0];

  it('annotates the registered scheduler with its last-success age gate', () => {
    const lastSuccessMs = Date.parse('2026-10-30T09:00:00.000Z');
    const result = includeExpectedAssetSchedulers(
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
    const result = includeExpectedAssetSchedulers([], [
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
    expect(includeExpectedAssetSchedulers([], [])).toEqual([]);
  });
});
